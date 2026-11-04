package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
)

type memCoach struct {
	mu       sync.Mutex
	samples  map[string]json.RawMessage
	improved map[uuid.UUID]json.RawMessage
}

func (m *memCoach) key(h string, band float32, lang string) string {
	return h + "|" + lang + "|" + string(rune('0'+int(band*2)))
}

func (m *memCoach) GetSample(_ context.Context, h string, band float32, lang string) (json.RawMessage, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.samples[m.key(h, band, lang)], nil
}

func (m *memCoach) SaveSample(_ context.Context, h, _, _ string, band float32, lang string, c json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.samples == nil {
		m.samples = map[string]json.RawMessage{}
	}
	m.samples[m.key(h, band, lang)] = c
	return nil
}

func (m *memCoach) SaveImproved(_ context.Context, id, _ uuid.UUID, c json.RawMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.improved == nil {
		m.improved = map[uuid.UUID]json.RawMessage{}
	}
	m.improved[id] = c
	return nil
}

type countingLLM struct {
	mu      sync.Mutex
	reply   string
	prompts []string
}

func (c *countingLLM) Complete(_ context.Context, _, user string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.prompts = append(c.prompts, user)
	return c.reply, nil
}

func newCoachFixture(t *testing.T, reply string) (*CoachService, *countingLLM, *fakeRepo, uuid.UUID) {
	t.Helper()
	users := &memUsers{}
	u, _ := users.Create(context.Background(), "c@example.com", "x")
	vocabSvc := NewVocabService(newMemVocab(), users, nil)
	if err := vocabSvc.SetGoals(context.Background(), u.ID, f32(6.0), f32(7.5)); err != nil {
		t.Fatal(err)
	}
	llm := &countingLLM{reply: reply}
	attempts := &fakeRepo{}
	return NewCoachService(llm, &memCoach{}, attempts, vocabSvc), llm, attempts, u.ID
}

func TestSampleAnswerIsCachedPerBandAndLanguage(t *testing.T) {
	answer := strings.Repeat("I really enjoy reading novels in my free time because it helps me relax. ", 4)
	reply := `{"answer": "` + answer + `", "phrases": [{"phrase": "in my free time", "meaning": "lúc rảnh"}, {"phrase": "", "meaning": "x"}], "tips": ["Dùng ví dụ cá nhân."]}`
	svc, llm, _, uid := newCoachFixture(t, reply)
	ctx := context.Background()

	s, err := svc.Sample(ctx, uid, "part1", "Do you enjoy reading?", "vi")
	if err != nil {
		t.Fatal(err)
	}
	if s.Band != 7.5 || len(s.Phrases) != 1 || len(s.Tips) != 1 || !strings.Contains(llm.prompts[0], "band 7.5") || !strings.Contains(llm.prompts[0], "Vietnamese") {
		t.Fatalf("sample: %+v / prompt %q", s, llm.prompts[0])
	}
	// Same question (spacing/case differ): from the cache.
	if _, err := svc.Sample(ctx, uid, "part1", "  do you ENJOY reading? ", "vi"); err != nil || len(llm.prompts) != 1 {
		t.Fatalf("cached: err=%v calls=%d", err, len(llm.prompts))
	}
	// Another language: a new answer.
	if _, err := svc.Sample(ctx, uid, "part1", "Do you enjoy reading?", "en"); err != nil || len(llm.prompts) != 2 || !strings.Contains(llm.prompts[1], "English") {
		t.Fatalf("en: err=%v calls=%d", err, len(llm.prompts))
	}
	if _, err := svc.Sample(ctx, uid, "shadowing", "Good morning.", "vi"); !errors.Is(err, ErrNotIELTSTask) {
		t.Fatalf("shadowing: %v", err)
	}
	llm.reply = `{"answer": "Too short.", "phrases": [], "tips": []}`
	if _, err := svc.Sample(ctx, uid, "part3", "Is the internet reliable?", "vi"); !errors.Is(err, ErrCoachUnavailable) {
		t.Fatalf("short answer: %v", err)
	}
}

func TestImproveAnswer(t *testing.T) {
	reply := `{"improved": "Well, I think the internet is extremely useful for students.", "changes": [{"original": "many informations", "improved": "a lot of information", "reason": "information không đếm được"}]}`
	svc, llm, attempts, uid := newCoachFixture(t, reply)
	ctx := context.Background()
	text, prompt := "I think internet is very useful for student, they can find many informations.", "Is the internet good for students?"
	a := &domain.PronunciationAttempt{ID: uuid.New(), UserID: uid, TaskType: "part3", RecognizedText: &text, TaskPrompt: &prompt}
	attempts.saved = a

	out, err := svc.Improve(ctx, uid, a.ID, "vi")
	if err != nil {
		t.Fatal(err)
	}
	if out.Band != 7.5 || out.Lang != "vi" || len(out.Changes) != 1 || !strings.Contains(llm.prompts[0], "many informations") {
		t.Fatalf("improve: %+v", out)
	}
	// Saved with the attempt: asking again does not call the LLM.
	a.ImprovedAnswer, _ = json.Marshal(out)
	if _, err := svc.Improve(ctx, uid, a.ID, "vi"); err != nil || len(llm.prompts) != 1 {
		t.Fatalf("cached: err=%v calls=%d", err, len(llm.prompts))
	}
	short := "Yes."
	a.RecognizedText, a.ImprovedAnswer = &short, nil
	if _, err := svc.Improve(ctx, uid, a.ID, "vi"); !errors.Is(err, ErrNoTranscript) {
		t.Fatalf("no transcript: %v", err)
	}
}

func TestHistoryPages(t *testing.T) {
	repo := &fakeRepo{}
	now := time.Now()
	for i := 0; i < 25; i++ {
		repo.history = append(repo.history, &domain.AttemptSummary{ID: uuid.New(), CreatedAt: now.Add(-time.Duration(i) * time.Minute), TaskType: "part1"})
	}
	svc := NewPronunciationService(fakeScorer{}, NewSpeakingGrader(loadRubric(t), nil, nil), fakeStorage{}, repo)
	h, err := svc.History(context.Background(), uuid.New(), "", nil)
	if err != nil || len(h.Attempts) != 20 || h.Next == nil || h.Counts["part1"] != 25 {
		t.Fatalf("page 1: %d next=%v err=%v", len(h.Attempts), h.Next, err)
	}
	h, err = svc.History(context.Background(), uuid.New(), "", h.Next)
	if err != nil || len(h.Attempts) != 5 || h.Next != nil {
		t.Fatalf("page 2: %d next=%v err=%v", len(h.Attempts), h.Next, err)
	}
}

func TestFillWordPhonemes(t *testing.T) {
	raw := []byte(`{"RecognitionStatus":"Success","NBest":[{"Words":[{"Word":"hello","Phonemes":[{"Phoneme":"h","AccuracyScore":90},{"Phoneme":"ax","AccuracyScore":40}]},{"Word":"world","Phonemes":[{"Phoneme":"w","AccuracyScore":100}]}]}]}`)
	a := &domain.PronunciationAttempt{AzureResult: raw, WordScores: []domain.WordScore{{Word: "hello"}, {Word: "world"}}}
	FillWordPhonemes(a)
	if len(a.WordScores[0].Phonemes) != 2 || a.WordScores[0].Phonemes[1].Phoneme != "ax" || a.WordScores[1].Phonemes[0].Score != 100 {
		t.Fatalf("got %+v", a.WordScores)
	}
}
