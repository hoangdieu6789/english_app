package rubric

import (
	"encoding/json"
	"englishapp/backend/internal/i18n"
	"os"
	"strings"
	"testing"
)

// The REST API for short audio returns scores flat on NBest[] / Words[] (not nested in
// PronunciationAssessment). rest-sample.json is Microsoft's documented sample response.
func TestParseRESTResponse(t *testing.T) {
	b, err := os.ReadFile("examples/azure/rest-sample.json")
	if err != nil {
		t.Fatal(err)
	}
	segs, err := ParseAzureSegments([][]byte{b}, 0.75)
	if err != nil {
		t.Fatal(err)
	}
	if len(segs) != 1 || len(segs[0].Words) != 2 {
		t.Fatalf("segments=%d", len(segs))
	}
	s := segs[0]
	if s.Scores.AccuracyScore != 100 || s.Scores.PronScore != 95.1 || s.Scores.ProsodyScore == nil || *s.Scores.ProsodyScore != 87.8 {
		t.Errorf("scores not read from flat REST fields: %+v", s.Scores)
	}
	if s.Words[1].Accuracy != 100 || s.Words[1].ErrorType != "None" {
		t.Errorf("word scores not read: %+v", s.Words[1])
	}
	// "morning" has MissingBreak confidence 1.0 but no punctuation before it: not a break error.
	if s.Words[1].MissingBreak || s.Words[1].UnexpectedBreak {
		t.Errorf("unexpected break flags: %+v", s.Words[1])
	}
	if s.SentenceType != "statement" {
		t.Errorf("sentence type %s", s.SentenceType)
	}
	if s.Start != 0.07 || s.End != 0.91 {
		t.Errorf("timing %v-%v", s.Start, s.End)
	}
}

func TestMissingBreakOnlyAfterPunctuation(t *testing.T) {
	raw := []byte(`{"DisplayText":"Well, I think so.","NBest":[{"Display":"Well, I think so.","AccuracyScore":90,
	 "Words":[
	  {"Word":"well","AccuracyScore":90,"ErrorType":"None"},
	  {"Word":"i","AccuracyScore":90,"ErrorType":"None","Feedback":{"Prosody":{"Break":{"MissingBreak":{"Confidence":0.9}}}}},
	  {"Word":"think","AccuracyScore":90,"ErrorType":"None","Feedback":{"Prosody":{"Break":{"MissingBreak":{"Confidence":0.9},"UnexpectedBreak":{"Confidence":0.8}}}}},
	  {"Word":"so","AccuracyScore":90,"ErrorType":"UnexpectedBreak"}]}]}`)
	segs, err := ParseAzureSegments([][]byte{raw}, 0.75)
	if err != nil {
		t.Fatal(err)
	}
	w := segs[0].Words
	if !w[1].MissingBreak {
		t.Error(`"I" follows a comma: MissingBreak should count`)
	}
	if w[2].MissingBreak {
		t.Error(`"think" has no punctuation before it: MissingBreak should not count`)
	}
	if !w[2].UnexpectedBreak || !w[3].UnexpectedBreak {
		t.Error("UnexpectedBreak from confidence and from word ErrorType should both count")
	}
}

func TestPunctuationBeforeWithMiscue(t *testing.T) {
	words := []AzureWord{{Word: "hello"}, {Word: "uh"}, {Word: "how"}, {Word: "are"}, {Word: "you"}}
	got := punctuationBefore(`"Hello," how are you?`, words)
	want := []bool{false, false, true, false, false}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("punctuationBefore = %v, want %v", got, want)
		}
	}
}

func TestOmittedWordsAreNotJudged(t *testing.T) {
	// Learner said nothing that matched: Azure reports the reference words as omissions.
	raw := []byte(`{"DisplayText":".","NBest":[{"Display":".","AccuracyScore":0,
	 "Words":[{"Word":"good","AccuracyScore":0,"ErrorType":"Omission"},{"Word":"morning","AccuracyScore":0,"ErrorType":"Omission"}]}]}`)
	segs, err := ParseAzureSegments([][]byte{raw}, 0.75)
	if err != nil {
		t.Fatal(err)
	}
	pron := DefaultPronunciationConfig().ScorePronunciation(segs, nil)
	for _, it := range pron.Items {
		if it.Measured {
			t.Errorf("%s measured from omitted words: %+v", it.Code, it)
		}
	}
	if pron.Assessed {
		t.Error("nothing spoken: pronunciation must not be assessed")
	}
	if h := ComputeSpeechHints(segs); h.Words != 0 {
		t.Errorf("speech hints counted omitted words: %+v", h)
	}
}

// ---- Tests below need rubric.yaml (gopkg.in/yaml.v3) ----

func TestPromptAndCriteria(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Criteria) != 4 || len(c.LLMCriteria()) != 3 {
		t.Fatalf("criteria=%d llm=%d", len(c.Criteria), len(c.LLMCriteria()))
	}
	for _, cr := range c.LLMCriteria() {
		if cr.ID == "pronunciation" {
			t.Error("pronunciation must not be sent to the LLM")
		}
	}
	p, err := c.BuildSystemPrompt()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(p, "{{") {
		t.Error("placeholders left in prompt")
	}
	if !strings.Contains(p, "# Fluency and Coherence (FC)") || strings.Contains(p, "# Pronunciation (P)") {
		t.Error("prompt must contain FC/LR/GRA docs and not the rule-scored pronunciation doc")
	}
	if !c.HasTask("part2") || c.HasTask("opinion") {
		t.Error("task types")
	}
}

func TestParseEvaluationSample(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile("examples/sample-evaluation.json")
	if err != nil {
		t.Fatal(err)
	}
	ev, err := c.ParseEvaluation("Here is the result:\n"+string(b), "part3")
	if err != nil {
		t.Fatal(err)
	}
	if len(ev.Criteria) != 3 || len(ev.NotAssessed) != 0 {
		t.Fatalf("criteria=%d not_assessed=%v", len(ev.Criteria), ev.NotAssessed)
	}
}

func TestParseEvaluationRepairs(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	reply := `{"task_type":"part1","criteria":[
	 {"id":"grammatical_range_accuracy","band":6,"rationale":"r","strengths":[],"next_step":"n","issues":[
	   {"code":"GRA-04","quote":"she like","correction":"she likes","explanation":"e","impact":"local","confidence":"high"},
	   {"code":"ACC-02","quote":"x","correction":"y","explanation":"e","impact":"local","confidence":"high"}]},
	 {"id":"lexical_resource","band":10,"rationale":"r","strengths":[],"issues":[],"next_step":"n"},
	 {"id":"pronunciation","band":7,"rationale":"r","strengths":[],"issues":[],"next_step":"n"}],
	 "not_assessed":[],"summary":"ok"}`
	ev, err := c.ParseEvaluation(reply, "part1")
	if err != nil {
		t.Fatal(err)
	}
	if len(ev.Criteria) != 1 || len(ev.Criteria[0].Issues) != 1 {
		t.Fatalf("criteria=%+v", ev.Criteria)
	}
	// A criterion whose issues are all invalid must serialise as [], not null.
	noIssues, _ := c.ParseEvaluation(`{"criteria":[{"id":"lexical_resource","band":5,"issues":[{"code":"BAD"}]}]}`, "part1")
	if b, _ := json.Marshal(noIssues.Criteria[0]); !strings.Contains(string(b), `"issues":[]`) || !strings.Contains(string(b), `"strengths":[]`) {
		t.Errorf("empty lists must not be null: %s", b)
	}
	reasons := map[string]string{}
	for _, na := range ev.NotAssessed {
		reasons[na.ID] = na.Reason
	}
	if reasons["lexical_resource"] != "invalid_band" || reasons["fluency_coherence"] != "not_returned" {
		t.Errorf("not_assessed = %v", reasons)
	}
	if _, ok := reasons["pronunciation"]; ok {
		t.Error("pronunciation from the LLM must be ignored, not reported")
	}
	if _, err := c.ParseEvaluation("no json here", "part1"); err == nil {
		t.Error("expected an error for a reply without JSON")
	}
}

func TestAssemble(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile("examples/sample-evaluation.json")
	ev, _ := c.ParseEvaluation(string(b), "part3")

	raw, _ := os.ReadFile("examples/azure/sample-segments.json")
	var arr []json.RawMessage
	_ = json.Unmarshal(raw, &arr)
	var segRaw [][]byte
	for _, a := range arr {
		segRaw = append(segRaw, a)
	}
	segs, _ := ParseAzureSegments(segRaw, c.Pronunciation.Thresholds.BreakConfidence)
	pron := c.Pronunciation.ScorePronunciation(segs, nil)
	hints := ComputeSpeechHints(segs)

	res := c.Assemble("part3", ev, &pron, &hints)
	if res.Overall.Band == 0 || res.Overall.Provisional || len(res.NotAssessed) != 0 {
		t.Errorf("full result: %+v", res.Overall)
	}

	// No audio: overall from the three LLM criteria, marked provisional.
	noAudio := c.Assemble("part3", ev, nil, nil)
	if !noAudio.Overall.Provisional || noAudio.Overall.Band != 5 {
		t.Errorf("no audio: %+v", noAudio.Overall)
	}

	// No LLM: pronunciation only, learner still gets a summary.
	onlyPron := c.Assemble("part3", nil, &pron, nil)
	if len(onlyPron.NotAssessed) != 3 || !strings.Contains(onlyPron.Summary, "Pronunciation: band") {
		t.Errorf("no LLM: not_assessed=%v summary=%q", onlyPron.NotAssessed, onlyPron.Summary)
	}
}

func TestWithLanguage(t *testing.T) {
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	en := c.WithLanguage("en")
	if en.Feedback.Language != "en" || c.Feedback.Language != "vi" || c.WithLanguage("xx") != c {
		t.Fatalf("en=%q base=%q", en.Feedback.Language, c.Feedback.Language)
	}
	p, err := en.BuildSystemPrompt()
	if err != nil || !strings.Contains(p, "**English**") {
		t.Fatalf("prompt: %v", err)
	}
	if s := en.pronunciationSummary(nil); !strings.HasPrefix(s, "Not enough data") {
		t.Fatalf("summary %q", s)
	}
}

// Every supported language has the code-written summary texts.
func TestSummaryMessagesComplete(t *testing.T) {
	for _, code := range i18n.Codes() {
		m, ok := summaryMessages[code]
		if !ok {
			t.Fatalf("no summary messages for %s", code)
		}
		for key := range summaryMessages["en"] {
			if m[key] == "" {
				t.Errorf("%s: missing %s", code, key)
			}
		}
	}
}
