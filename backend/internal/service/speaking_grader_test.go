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
	"sync"
	"testing"
	"time"

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

func (f fakeScorer) ScoreTranscribed(ctx context.Context, wav []byte, transcript string) (*ScoreResult, error) {
	return f.Score(ctx, wav, transcript)
}

type fakeStorage struct{}

func (fakeStorage) Save(context.Context, []byte) (string, error) { return "/uploads/x.wav", nil }

type fakeRepo struct {
	mu      sync.Mutex
	saved   *domain.PronunciationAttempt
	updates []domain.GradingUpdate
	status  map[uuid.UUID]string
	pending []*domain.PronunciationAttempt
	history []*domain.AttemptSummary // newest first
}

func (r *fakeRepo) Create(_ context.Context, a *domain.PronunciationAttempt) (*domain.PronunciationAttempt, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	a.ID = uuid.New()
	r.saved = a
	return a, nil
}

func (r *fakeRepo) Get(context.Context, uuid.UUID, uuid.UUID) (*domain.PronunciationAttempt, error) {
	return r.saved, nil
}

func (r *fakeRepo) UpdateGrading(_ context.Context, _ uuid.UUID, u domain.GradingUpdate) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.updates = append(r.updates, u)
	return nil
}

func (r *fakeRepo) SetGradingStatus(_ context.Context, id uuid.UUID, status string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.status == nil {
		r.status = map[uuid.UUID]string{}
	}
	r.status[id] = status
	return nil
}

func (r *fakeRepo) ListPendingGrading(context.Context, int) ([]*domain.PronunciationAttempt, error) {
	return r.pending, nil
}

func (r *fakeRepo) List(_ context.Context, _ uuid.UUID, _ string, before *time.Time, limit int) ([]*domain.AttemptSummary, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []*domain.AttemptSummary
	for _, s := range r.history {
		if before == nil || s.CreatedAt.Before(*before) {
			out = append(out, s)
		}
		if len(out) == limit {
			break
		}
	}
	return out, nil
}

func (r *fakeRepo) CountByType(context.Context, uuid.UUID) (map[string]int, error) {
	return map[string]int{"part1": len(r.history)}, nil
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

// sourceLLM answers like a real completer: it reports which provider/model answered.
type sourceLLM struct {
	reply string
	delay time.Duration
}

func (f *sourceLLM) Complete(ctx context.Context, _, _ string) (string, error) {
	time.Sleep(f.delay)
	reportLLMSource(ctx, "claude", "claude-sonnet-5-5")
	return f.reply, nil
}

func TestSubmitIELTSReturnsBeforeLLMAndUpdatesInBackground(t *testing.T) {
	sample, err := os.ReadFile("../rubric/examples/sample-evaluation.json")
	if err != nil {
		t.Fatal(err)
	}
	repo := &fakeRepo{}
	llm := &sourceLLM{reply: string(sample), delay: 300 * time.Millisecond}
	svc := NewPronunciationService(fakeScorer{raw: firstSampleSegment(t)}, NewSpeakingGrader(loadRubric(t), llm, nil), fakeStorage{}, repo)

	start := time.Now()
	a, err := svc.SubmitAttempt(context.Background(), uuid.New(), []byte("RIFF"), "", SpeakingTask{Type: "part3", Prompt: "Is the internet good for students?"})
	if err != nil {
		t.Fatal(err)
	}
	if took := time.Since(start); took > 200*time.Millisecond {
		t.Fatalf("SubmitAttempt waited for the LLM (%s)", took)
	}
	var quick rubric.Result
	if err := json.Unmarshal(a.Rubric, &quick); err != nil {
		t.Fatal(err)
	}
	if a.GradingStatus != domain.GradingPending || a.RubricScore != nil || quick.Pronunciation == nil || !quick.Pronunciation.Assessed || len(quick.Criteria) != 0 {
		t.Fatalf("quick result: status=%s score=%v pron=%+v criteria=%d", a.GradingStatus, a.RubricScore, quick.Pronunciation, len(quick.Criteria))
	}

	svc.Wait()
	if len(repo.updates) != 1 {
		t.Fatalf("updates = %d, want 1", len(repo.updates))
	}
	u := repo.updates[0]
	var final rubric.Result
	if err := json.Unmarshal(u.Rubric, &final); err != nil {
		t.Fatal(err)
	}
	if u.Status != domain.GradingDone || u.RubricScore == nil || float64(*u.RubricScore) != final.Overall.Band || len(final.Criteria) != 3 ||
		u.GraderProvider == nil || *u.GraderProvider != "claude" || *u.GraderModel != "claude-sonnet-5-5" {
		t.Fatalf("final update = %+v (criteria %d)", u, len(final.Criteria))
	}

	// Shadowing never waits for an LLM and is done at once.
	a, err = svc.SubmitAttempt(context.Background(), uuid.New(), []byte("RIFF"), "Good morning.", SpeakingTask{Type: TaskShadowing})
	if err != nil || a.GradingStatus != domain.GradingDone || a.RubricScore == nil {
		t.Fatalf("shadowing: status=%s err=%v", a.GradingStatus, err)
	}
	svc.Wait()
	if len(repo.updates) != 1 {
		t.Fatal("shadowing must not start a background step")
	}
}

func TestResumePendingFinishesLeftoverAttempts(t *testing.T) {
	sample, err := os.ReadFile("../rubric/examples/sample-evaluation.json")
	if err != nil {
		t.Fatal(err)
	}
	text := "Well, I think so."
	prompt := "Is the internet good for students?"
	good := &domain.PronunciationAttempt{ID: uuid.New(), TaskType: "part3", TaskPrompt: &prompt, RecognizedText: &text, AzureResult: firstSampleSegment(t)}
	broken := &domain.PronunciationAttempt{ID: uuid.New(), TaskType: "part3", AzureResult: []byte("not json")}
	repo := &fakeRepo{pending: []*domain.PronunciationAttempt{good, broken}}
	svc := NewPronunciationService(fakeScorer{}, NewSpeakingGrader(loadRubric(t), &sourceLLM{reply: string(sample)}, nil), fakeStorage{}, repo)

	n, err := svc.ResumePending(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v", n, err)
	}
	svc.Wait()
	if len(repo.updates) != 1 || repo.updates[0].Status != domain.GradingDone {
		t.Fatalf("updates = %+v", repo.updates)
	}
	if repo.status[broken.ID] != domain.GradingFailed {
		t.Fatalf("broken attempt status = %q, want failed", repo.status[broken.ID])
	}
}

func TestPartialIELTSResultHasNoOverallBand(t *testing.T) {
	cfg := loadRubric(t)
	g := NewSpeakingGrader(cfg, nil, nil)
	in := GradeInput{Task: SpeakingTask{Type: "part1"}, AzureRaw: firstSampleSegment(t)}
	res, _, err := g.GradePronunciation(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	// Only Pronunciation was assessed: the rubric gives a provisional band from it alone.
	if res.Overall.Band <= 0 || !res.Overall.Provisional {
		t.Fatalf("overall = %+v", res.Overall)
	}
	if hasOverallBand(res) {
		t.Fatal("a Pronunciation-only IELTS result must not be stored as the attempt's band")
	}
	u := gradingUpdate(res, &LLMSource{})
	if u.RubricScore != nil || u.CEFRLevel != nil {
		t.Fatalf("update = %+v", u)
	}
	res.TaskType = TaskShadowing
	if !hasOverallBand(res) {
		t.Fatal("shadowing keeps its Pronunciation band")
	}
}
