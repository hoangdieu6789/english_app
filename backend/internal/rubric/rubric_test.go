package rubric

import (
	"encoding/json"
	"os"
	"testing"
)

func loadSample(t *testing.T) []Segment {
	t.Helper()
	b, err := os.ReadFile("examples/azure/sample-segments.json")
	if err != nil {
		t.Fatal(err)
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(b, &arr); err != nil {
		t.Fatal(err)
	}
	raw := make([][]byte, len(arr))
	for i := range arr {
		raw[i] = arr[i]
	}
	segs, err := ParseAzureSegments(raw, 0.75)
	if err != nil {
		t.Fatal(err)
	}
	return segs
}

func TestSentenceType(t *testing.T) {
	cases := map[string]string{
		"I like it.":           "statement",
		"Where do you live?":   "wh_question",
		"Do you like it?":      "yes_no_question",
		"You like it?":         "yes_no_question",
		"It's nice, isn't it?": "tag_question",
		"":                     "other",
	}
	for in, want := range cases {
		if got := SentenceType(in); got != want {
			t.Errorf("SentenceType(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestScorePronunciation(t *testing.T) {
	segs := loadSample(t)
	pc := DefaultPronunciationConfig()
	if n := len(PitchItems(segs, 0.3)); n != 4 {
		t.Fatalf("pitch items = %d, want 4", n)
	}
	pitch := []PitchResult{{ID: 0, Direction: "fall"}, {ID: 1, Direction: "fall"},
		{ID: 2, Direction: "fall"}, {ID: 3, Direction: "level"}}
	r := pc.ScorePronunciation(segs, pitch)
	b, _ := json.MarshalIndent(r, "", "  ")
	t.Log(string(b))
	if !r.Assessed || r.Coverage != "5/6" || r.Band < 1 || r.Band > 9 {
		t.Fatalf("assessed=%v coverage=%s band=%d", r.Assessed, r.Coverage, r.Band)
	}
	if len(r.ToneIssues) != 2 || len(r.Mispronounced) != 2 {
		t.Errorf("tone issues=%d mispronounced=%v", len(r.ToneIssues), r.Mispronounced)
	}
	if r2 := pc.ScorePronunciation(segs, nil); !r2.Assessed {
		t.Errorf("no-pitch result should still be assessed")
	}
	if r3 := pc.ScorePronunciation(nil, nil); r3.Assessed || r3.Reason != "insufficient_speech" {
		t.Errorf("empty input should not be assessed: %+v", r3)
	}
}

func TestSpeechHints(t *testing.T) {
	h := ComputeSpeechHints(loadSample(t))
	t.Logf("%+v", h)
	if h.FillerCount != 1 || h.Repetitions != 1 || h.Words != 30 || h.MidSentencePauses != 1 {
		t.Errorf("hints = %+v", h)
	}
}

func TestRoundHalf(t *testing.T) {
	cases := []struct {
		v    float64
		mode string
		want float64
	}{
		{6.0, "ielts_half", 6}, {6.25, "ielts_half", 6.5}, {6.5, "ielts_half", 6.5},
		{6.75, "ielts_half", 7}, {6.2, "ielts_half", 6}, {6.75, "floor_half", 6.5}, {6.25, "floor_half", 6},
	}
	for _, c := range cases {
		if got := RoundHalf(c.v, c.mode); got != c.want {
			t.Errorf("RoundHalf(%v,%s)=%v want %v", c.v, c.mode, got, c.want)
		}
	}
}

func TestOverallBand(t *testing.T) {
	c := &Config{Criteria: []Criterion{{ID: "fluency_coherence"}, {ID: "lexical_resource"},
		{ID: "grammatical_range_accuracy"}, {ID: "pronunciation"}}}
	c.Overall.Rounding = "ielts_half"
	r := c.OverallBand(map[string]int{"fluency_coherence": 6, "lexical_resource": 6, "grammatical_range_accuracy": 6, "pronunciation": 7})
	if r.Band != 6.5 || r.Provisional {
		t.Errorf("got %+v", r)
	}
	r = c.OverallBand(map[string]int{"fluency_coherence": 6, "lexical_resource": 5, "grammatical_range_accuracy": 5})
	if !r.Provisional || r.Band != 5.5 {
		t.Errorf("got %+v", r)
	}
}
