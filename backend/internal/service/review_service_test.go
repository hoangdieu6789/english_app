package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

func TestWeakWords(t *testing.T) {
	got := WeakWords([]domain.WordScore{
		{Word: "Photographer,", AccuracyScore: 7, ErrorType: "mispronunciation"},
		{Word: "candid", AccuracyScore: 55, ErrorType: "none"},
		{Word: "candid", AccuracyScore: 40, ErrorType: "none"}, // lowest kept
		{Word: "moments", AccuracyScore: 90, ErrorType: "none"},
		{Word: "the", AccuracyScore: 10, ErrorType: "none"},         // stopword
		{Word: "an", AccuracyScore: 10, ErrorType: "none"},          // too short
		{Word: "avid", AccuracyScore: 0, ErrorType: "omission"},     // not said
		{Word: "really", AccuracyScore: 30, ErrorType: "insertion"}, // not in the text
		{Word: "unposed", AccuracyScore: 70, ErrorType: "mispronunciation"},
	})
	want := map[string]float32{"photographer": 7, "candid": 40, "unposed": 70}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
}

func TestScheduleSM2(t *testing.T) {
	now := time.Date(2026, 11, 4, 10, 0, 0, 0, time.UTC)
	w := &domain.ReviewWord{Ease: 2.5}
	day := 24 * time.Hour

	Schedule(w, 90, now) // q5
	if w.Reps != 1 || w.IntervalDays != 1 || !w.DueAt.Equal(now.Add(day)) || w.Ease <= 2.5 {
		t.Fatalf("first pass: %+v", w)
	}
	Schedule(w, 80, now) // q4
	if w.Reps != 2 || w.IntervalDays != 6 {
		t.Fatalf("second pass: %+v", w)
	}
	ease := w.Ease
	Schedule(w, 65, now) // q3
	if w.Reps != 3 || w.IntervalDays != int(6*ease+0.5) || w.Ease >= ease {
		t.Fatalf("third pass: %+v (ease before %v)", w, ease)
	}
	Schedule(w, 30, now) // fail
	if w.Reps != 0 || w.Lapses != 1 || w.IntervalDays != 0 || !w.DueAt.Equal(now.Add(relearnDelay)) {
		t.Fatalf("fail: %+v", w)
	}
	for i := 0; i < 20; i++ {
		Schedule(w, 0, now)
	}
	if w.Ease < 1.3 || w.Lapses != 1 {
		t.Fatalf("ease floor / lapses only counted after a success: %+v", w)
	}
}

type memReviews struct {
	mu    sync.Mutex
	words map[uuid.UUID]*domain.ReviewWord
}

func (m *memReviews) Upsert(_ context.Context, uid uuid.UUID, word string, score float32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.words == nil {
		m.words = map[uuid.UUID]*domain.ReviewWord{}
	}
	for _, w := range m.words {
		if w.UserID == uid && w.Word == word {
			w.LastScore, w.Reps, w.IntervalDays, w.DueAt = score, 0, 0, time.Now()
			return nil
		}
	}
	id := uuid.New()
	m.words[id] = &domain.ReviewWord{ID: id, UserID: uid, Word: word, LastScore: score, Ease: 2.5, DueAt: time.Now(), Kind: domain.ReviewPronunciation, Misses: 1}
	return nil
}

func (m *memReviews) ListPronunciationWords(context.Context) (map[uuid.UUID]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := map[uuid.UUID]string{}
	for id, w := range m.words {
		if w.Kind == domain.ReviewPronunciation {
			out[id] = w.Word
		}
	}
	return out, nil
}

func (m *memReviews) DeleteByIDs(_ context.Context, ids []uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, id := range ids {
		delete(m.words, id)
	}
	return nil
}

func (m *memReviews) list(uid uuid.UUID, due bool) []*domain.ReviewWord {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []*domain.ReviewWord
	for _, w := range m.words {
		if w.UserID == uid && (!w.DueAt.After(time.Now())) == due {
			out = append(out, w)
		}
	}
	return out
}

func (m *memReviews) ListDue(_ context.Context, uid uuid.UUID, _ string, _ int) ([]*domain.ReviewWord, error) {
	return m.list(uid, true), nil
}

func (m *memReviews) ListUpcoming(_ context.Context, uid uuid.UUID, _ string, _ int) ([]*domain.ReviewWord, error) {
	return m.list(uid, false), nil
}

func (m *memReviews) Count(_ context.Context, uid uuid.UUID) (int, int, error) {
	due := len(m.list(uid, true))
	return due, due + len(m.list(uid, false)), nil
}

func (m *memReviews) Get(_ context.Context, id, uid uuid.UUID, _ string) (*domain.ReviewWord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if w, ok := m.words[id]; ok && w.UserID == uid {
		c := *w
		return &c, nil
	}
	return nil, repository.ErrNotFound
}

func (m *memReviews) UpdateSchedule(_ context.Context, w *domain.ReviewWord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c := *w
	m.words[w.ID] = &c
	return nil
}

func (m *memReviews) Delete(_ context.Context, id, uid uuid.UUID) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if w, ok := m.words[id]; ok && w.UserID == uid {
		delete(m.words, id)
		return true, nil
	}
	return false, nil
}

// wordScorer answers like Azure scoring one word.
type wordScorer struct {
	fakeScorer
	score float32
	refs  []string
}

func (s *wordScorer) Score(_ context.Context, _ []byte, ref string) (*ScoreResult, error) {
	s.refs = append(s.refs, ref)
	return &ScoreResult{
		RecognizedText: ref,
		OverallScore:   s.score,
		WordScores:     []domain.WordScore{{Word: ref, AccuracyScore: s.score, ErrorType: "none"}},
		PhonemeScores:  []domain.PhonemeScore{{Phoneme: "f", Score: s.score}},
	}, nil
}

func TestReviewFlow(t *testing.T) {
	repo := &memReviews{}
	scorer := &wordScorer{}
	svc := NewReviewService(repo, scorer)
	ctx := context.Background()
	uid, other := uuid.New(), uuid.New()

	svc.AddFromAttempt(ctx, uid, []domain.WordScore{
		{Word: "photographer", AccuracyScore: 7, ErrorType: "mispronunciation"},
		{Word: "city", AccuracyScore: 95, ErrorType: "none"},
	})
	q, err := svc.Queue(ctx, uid, "vi")
	if err != nil || q.DueCount != 1 || q.Total != 1 || q.Due[0].Word != "photographer" {
		t.Fatalf("queue: %+v err=%v", q, err)
	}
	id := q.Due[0].ID

	if _, err := svc.Review(ctx, other, id, []byte("RIFF"), "vi"); err != repository.ErrNotFound {
		t.Fatalf("another user's word: %v", err)
	}
	scorer.score = 88
	res, err := svc.Review(ctx, uid, id, []byte("RIFF"), "vi")
	if err != nil {
		t.Fatal(err)
	}
	if scorer.refs[0] != "photographer" || res.Score != 88 || res.Quality != 5 || res.Word.IntervalDays != 1 {
		t.Fatalf("review: %+v refs=%v", res, scorer.refs)
	}
	if q, _ := svc.Queue(ctx, uid, "vi"); q.DueCount != 0 || len(q.Upcoming) != 1 {
		t.Fatalf("after a pass the word must wait: %+v", q)
	}
	// Said wrongly again in practice: due again.
	svc.AddFromAttempt(ctx, uid, []domain.WordScore{{Word: "Photographer.", AccuracyScore: 20, ErrorType: "none"}})
	if q, _ := svc.Queue(ctx, uid, "vi"); q.DueCount != 1 || q.Total != 1 {
		t.Fatalf("weak again: %+v", q)
	}
	if ok, _ := svc.Remove(ctx, other, id); ok {
		t.Fatal("another user removed the word")
	}
	if ok, _ := svc.Remove(ctx, uid, id); !ok {
		t.Fatal("remove failed")
	}
}

func TestSubmitQueuesWeakWords(t *testing.T) {
	repo := &memReviews{}
	sc := &recordingScorer{fakeScorer: fakeScorer{raw: firstSampleSegment(t)}}
	svc := NewPronunciationService(sc, NewSpeakingGrader(loadRubric(t), nil, nil), fakeStorage{}, &fakeRepo{})
	svc.SetReviews(NewReviewService(repo, sc))
	uid := uuid.New()
	// fakeScorer's words ("good", "morning") are scored 100: nothing to review.
	if _, err := svc.SubmitAttempt(context.Background(), uid, []byte("RIFF"), "Good morning.", SpeakingTask{Type: TaskShadowing}); err != nil {
		t.Fatal(err)
	}
	if _, total, _ := repo.Count(context.Background(), uid); total != 0 {
		t.Fatalf("total = %d, want 0", total)
	}
}

func TestWeakWordsSkipNonWords(t *testing.T) {
	got := WeakWords([]domain.WordScore{
		{Word: "sweatered", AccuracyScore: 38, ErrorType: "none"},
		{Word: "Jarosz", AccuracyScore: 20, ErrorType: "mispronunciation"},
		{Word: "unposed", AccuracyScore: 53, ErrorType: "none"},
	})
	if len(got) != 1 || got["unposed"] != 53 {
		t.Fatalf("got %v", got)
	}
}

func TestCleanupMisrecognised(t *testing.T) {
	repo := &memReviews{}
	svc := NewReviewService(repo, &wordScorer{})
	uid := uuid.New()
	for _, w := range []string{"sweatered", "jarosz", "atmosphere"} {
		_ = repo.Upsert(context.Background(), uid, w, 30)
	}
	n, err := svc.CleanupMisrecognised(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("removed %d, err %v", n, err)
	}
	if _, total, _ := repo.Count(context.Background(), uid); total != 1 {
		t.Fatalf("left %d words", total)
	}
}

func TestVocabCardsAreGradedNotScheduledByAzure(t *testing.T) {
	repo := &memReviews{words: map[uuid.UUID]*domain.ReviewWord{}}
	uid, id := uuid.New(), uuid.New()
	repo.words[id] = &domain.ReviewWord{ID: id, UserID: uid, Word: "atmosphere", Kind: domain.ReviewVocab, Ease: 2.5, DueAt: time.Now()}
	scorer := &wordScorer{score: 95}
	svc := NewReviewService(repo, scorer)

	res, err := svc.Review(context.Background(), uid, id, []byte("RIFF"), "vi")
	if err != nil || res.Score != 95 {
		t.Fatalf("review: %+v %v", res, err)
	}
	if w, _ := repo.Get(context.Background(), id, uid, "vi"); w.Reps != 0 || w.IntervalDays != 0 {
		t.Fatalf("a pronunciation score must not schedule a vocab card: %+v", w)
	}
	w, err := svc.Grade(context.Background(), uid, id, 4, "vi")
	if err != nil || w.Reps != 1 || w.IntervalDays != 1 {
		t.Fatalf("grade: %+v %v", w, err)
	}
	if w, err := svc.Grade(context.Background(), uid, id, 1, "vi"); err != nil || w.Reps != 0 || w.Lapses != 1 {
		t.Fatalf("forgot: %+v %v", w, err)
	}
	pid := uuid.New()
	repo.words[pid] = &domain.ReviewWord{ID: pid, UserID: uid, Word: "hectic", Kind: domain.ReviewPronunciation, Ease: 2.5}
	if _, err := svc.Grade(context.Background(), uid, pid, 5, "vi"); err != ErrNotVocabCard {
		t.Fatalf("pronunciation card rated: %v", err)
	}
}
