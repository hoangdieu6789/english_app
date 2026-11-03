package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/rubric"
)

// Microsoft's documented REST sample response (prosody enabled).
func restSample(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile("../rubric/examples/azure/rest-sample.json")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestAzureScorerRequestsProsodyAndParsesREST(t *testing.T) {
	sample := restSample(t)
	var gotCfg map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := base64.StdEncoding.DecodeString(r.Header.Get("Pronunciation-Assessment"))
		_ = json.Unmarshal(raw, &gotCfg)
		if r.URL.Query().Get("language") != "en-US" || r.Header.Get("Ocp-Apim-Subscription-Key") != "k" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		w.Write(sample)
	}))
	defer srv.Close()

	s := NewAzurePronunciationScorer("k", "westeurope", 1)
	s.endpoint = srv.URL

	res, err := s.Score(context.Background(), []byte("RIFF"), "Good morning.")
	if err != nil {
		t.Fatal(err)
	}
	if gotCfg["EnableProsodyAssessment"] != "True" || gotCfg["EnableMiscue"] != true || gotCfg["ReferenceText"] != "Good morning." {
		t.Errorf("assessment config = %v", gotCfg)
	}
	if res.ProsodyScore == nil || *res.ProsodyScore != 87.8 || res.CompletenessScore != 100 || res.PronScore != 95.1 {
		t.Errorf("scores = %+v", res)
	}
	if len(res.WordScores) != 2 || res.WordScores[1].OffsetMs != 340 || res.WordScores[1].DurationMs != 570 {
		t.Errorf("words = %+v", res.WordScores)
	}
	if string(res.Raw) != string(sample) {
		t.Error("raw response not kept")
	}

	// Unscripted: no reference text -> miscue off.
	if _, err := s.Score(context.Background(), []byte("RIFF"), ""); err != nil {
		t.Fatal(err)
	}
	if gotCfg["EnableMiscue"] != false {
		t.Errorf("unscripted config = %v", gotCfg)
	}
}

type fakeLLM struct {
	reply  string
	err    error
	system string
	user   string
}

func (f *fakeLLM) Complete(_ context.Context, system, user string) (string, error) {
	f.system, f.user = system, user
	return f.reply, f.err
}

func loadRubric(t *testing.T) *rubric.Config {
	t.Helper()
	cfg, err := rubric.Load()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

// firstSampleSegment is one segment (10 words) of the rubric's Azure sample: enough speech
// for the rule-based Pronunciation criterion.
func firstSampleSegment(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile("../rubric/examples/azure/sample-segments.json")
	if err != nil {
		t.Fatal(err)
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(b, &arr); err != nil {
		t.Fatal(err)
	}
	return arr[0]
}

func reasons(res *rubric.Result) map[string]string {
	m := map[string]string{}
	for _, na := range res.NotAssessed {
		m[na.ID] = na.Reason
	}
	return m
}

func TestGraderShadowingScoresPronunciationOnly(t *testing.T) {
	llm := &fakeLLM{}
	g := NewSpeakingGrader(loadRubric(t), llm, nil)
	res, segs, err := g.Grade(context.Background(), GradeInput{
		Task: SpeakingTask{Type: TaskShadowing}, AzureRaw: firstSampleSegment(t),
	})
	if err != nil {
		t.Fatal(err)
	}
	if llm.system != "" {
		t.Error("shadowing must not call the LLM")
	}
	if len(segs) != 1 || res.Pronunciation == nil || !res.Pronunciation.Assessed {
		t.Fatalf("pronunciation = %+v", res.Pronunciation)
	}
	if res.Overall.Band != float64(res.Pronunciation.Band) || !res.Overall.Provisional {
		t.Errorf("overall = %+v", res.Overall)
	}
	r := reasons(res)
	for _, id := range []string{"fluency_coherence", "lexical_resource", "grammatical_range_accuracy"} {
		if r[id] != ReasonNotInTask {
			t.Errorf("%s: reason %q, want %q", id, r[id], ReasonNotInTask)
		}
	}
	if res.SpeechHints == nil || res.SpeechHints.PronunciationBand != res.Pronunciation.Band {
		t.Errorf("speech hints = %+v", res.SpeechHints)
	}

	// Two words (Microsoft's REST sample) is too little speech for a Pronunciation band.
	res, _, err = g.Grade(context.Background(), GradeInput{Task: SpeakingTask{Type: TaskShadowing}, AzureRaw: restSample(t)})
	if err != nil {
		t.Fatal(err)
	}
	if res.Overall.Band != 0 || reasons(res)["pronunciation"] != "insufficient_speech" {
		t.Errorf("short shadowing: overall=%+v not_assessed=%v", res.Overall, res.NotAssessed)
	}
}

func TestGraderIELTSPartCallsLLM(t *testing.T) {
	sample, err := os.ReadFile("../rubric/examples/sample-evaluation.json")
	if err != nil {
		t.Fatal(err)
	}
	llm := &fakeLLM{reply: string(sample)}
	g := NewSpeakingGrader(loadRubric(t), llm, nil)
	task := SpeakingTask{Type: "part3", Prompt: "Is the internet good for students?"}
	res, _, err := g.Grade(context.Background(), GradeInput{Task: task, Transcript: "Well, I think so.", AzureRaw: firstSampleSegment(t)})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(llm.system, "# Fluency and Coherence (FC)") || strings.Contains(llm.system, "{{") {
		t.Error("system prompt not built from the rubric")
	}
	for _, want := range []string{`"task_type":"part3"`, `"questions":"Is the internet good for students?"`, `"speech_hints":{`, `"words_per_minute"`} {
		if !strings.Contains(llm.user, want) {
			t.Errorf("user message lacks %s: %s", want, llm.user)
		}
	}
	if len(res.Criteria) != 3 || res.Pronunciation == nil || !res.Pronunciation.Assessed ||
		res.Overall.Provisional || res.Overall.Band == 0 || res.Overall.CEFR == "" || res.Summary == "" {
		t.Errorf("result = %+v", res)
	}

	// LLM failure: the grade still returns; the three transcript criteria are not assessed.
	g = NewSpeakingGrader(loadRubric(t), &fakeLLM{err: errors.New("down")}, nil)
	res, _, err = g.Grade(context.Background(), GradeInput{Task: task, AzureRaw: firstSampleSegment(t)})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Criteria) != 0 || len(res.NotAssessed) != 3 || reasons(res)["lexical_resource"] != "grader_unavailable" {
		t.Errorf("llm down: criteria=%d not_assessed=%v", len(res.Criteria), res.NotAssessed)
	}

	for _, bad := range []string{"opinion", "essay"} {
		if _, _, err := g.Grade(context.Background(), GradeInput{Task: SpeakingTask{Type: bad}}); err == nil {
			t.Errorf("task type %q should fail", bad)
		}
	}
}

type fakeScorer struct{ raw []byte }

func (f fakeScorer) Score(context.Context, []byte, string) (*ScoreResult, error) {
	p := float32(87.8)
	return &ScoreResult{
		RecognizedText: "Good morning.", OverallScore: 100, FluencyScore: 100, CompletenessScore: 100,
		ProsodyScore: &p, PronScore: 95.1,
		WordScores: []domain.WordScore{{Word: "good", AccuracyScore: 100, ErrorType: "none"}, {Word: "morning", AccuracyScore: 100, ErrorType: "none"}},
		Raw:        f.raw,
	}, nil
}

type fakeStorage struct{}

func (fakeStorage) Save(context.Context, []byte) (string, error) { return "/uploads/x.wav", nil }

type fakeRepo struct{ saved *domain.PronunciationAttempt }

func (r *fakeRepo) Create(_ context.Context, a *domain.PronunciationAttempt) (*domain.PronunciationAttempt, error) {
	r.saved = a
	return a, nil
}

func TestSubmitAttemptStoresRubric(t *testing.T) {
	repo := &fakeRepo{}
	svc := NewPronunciationService(fakeScorer{raw: firstSampleSegment(t)}, NewSpeakingGrader(loadRubric(t), nil, nil), fakeStorage{}, repo)
	a, err := svc.SubmitAttempt(context.Background(), uuid.New(), []byte("RIFF"), "Good morning.", SpeakingTask{Type: TaskShadowing})
	if err != nil {
		t.Fatal(err)
	}
	if a.TaskType != TaskShadowing || len(a.AzureResult) == 0 || len(a.Rubric) == 0 || a.RubricScore == nil || a.CEFRLevel == nil || a.RubricVersion == nil {
		t.Fatalf("attempt = %+v", a)
	}
	var res rubric.Result
	if err := json.Unmarshal(a.Rubric, &res); err != nil || res.TaskType != TaskShadowing || float64(*a.RubricScore) != res.Overall.Band {
		t.Errorf("stored rubric = %s (%v)", a.Rubric, err)
	}
	if !svc.HasTask("part2") || !svc.HasTask(TaskShadowing) || svc.HasTask("opinion") {
		t.Error("HasTask")
	}

	// A broken provider response must not lose the attempt.
	svc = NewPronunciationService(fakeScorer{raw: []byte("not json")}, NewSpeakingGrader(loadRubric(t), nil, nil), fakeStorage{}, repo)
	a, err = svc.SubmitAttempt(context.Background(), uuid.New(), []byte("RIFF"), "Good morning.", SpeakingTask{Type: TaskShadowing})
	if err != nil {
		t.Fatal(err)
	}
	if a.Rubric != nil || a.RubricScore != nil {
		t.Error("rubric should be empty when grading fails")
	}
}
