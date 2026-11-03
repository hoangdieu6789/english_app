package service

import (
	"context"
	"errors"
	"math/rand"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
)

// fakeQuestionRepo keeps sets and per-user "done" marks in memory.
type fakeQuestionRepo struct {
	mu   sync.Mutex
	sets []domain.QuestionSet
	done map[string]time.Time // userID|setID|taskType -> last attempt
}

func newFakeQuestionRepo() *fakeQuestionRepo {
	return &fakeQuestionRepo{done: map[string]time.Time{}}
}

func doneKey(u uuid.UUID, id uuid.UUID, task string) string {
	return u.String() + "|" + id.String() + "|" + task
}

func (r *fakeQuestionRepo) markDone(u uuid.UUID, id uuid.UUID, task string, at time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.done[doneKey(u, id, task)] = at
}

func (r *fakeQuestionRepo) Insert(_ context.Context, set domain.QuestionSet) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range r.sets {
		if s.Kind == set.Kind && strings.EqualFold(s.Topic, set.Topic) {
			return false, nil
		}
	}
	set.ID = uuid.New()
	r.sets = append(r.sets, set)
	return true, nil
}

func (r *fakeQuestionRepo) Get(_ context.Context, id uuid.UUID) (*domain.QuestionSet, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range r.sets {
		if s.ID == id {
			c := s
			return &c, nil
		}
	}
	return nil, nil
}

func (r *fakeQuestionRepo) filter(u uuid.UUID, kind, task string, exclude *uuid.UUID, wantDone bool) []domain.QuestionSet {
	var out []domain.QuestionSet
	for _, s := range r.sets {
		_, done := r.done[doneKey(u, s.ID, task)]
		if s.Kind == kind && done == wantDone && (exclude == nil || s.ID != *exclude) {
			out = append(out, s)
		}
	}
	return out
}

func (r *fakeQuestionRepo) PickUnseen(_ context.Context, u uuid.UUID, kind, task string, exclude *uuid.UUID) (*domain.QuestionSet, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := r.filter(u, kind, task, exclude, false)
	if len(c) == 0 {
		return nil, nil
	}
	s := c[rand.Intn(len(c))]
	return &s, nil
}

func (r *fakeQuestionRepo) PickOldestDone(_ context.Context, u uuid.UUID, kind, task string, exclude *uuid.UUID) (*domain.QuestionSet, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var best *domain.QuestionSet
	var bestAt time.Time
	for _, s := range r.filter(u, kind, task, exclude, true) {
		at := r.done[doneKey(u, s.ID, task)]
		if best == nil || at.Before(bestAt) {
			c := s
			best, bestAt = &c, at
		}
	}
	return best, nil
}

func (r *fakeQuestionRepo) CountUnseen(_ context.Context, u uuid.UUID, kind, task string) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.filter(u, kind, task, nil, false)), nil
}

func (r *fakeQuestionRepo) ListWithProgress(_ context.Context, u uuid.UUID, kind, task string) ([]domain.QuestionSetProgress, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.QuestionSetProgress
	for _, s := range r.sets {
		if s.Kind != kind {
			continue
		}
		p := domain.QuestionSetProgress{QuestionSet: s}
		if at, ok := r.done[doneKey(u, s.ID, task)]; ok {
			p.AttemptCount, p.LastAttemptAt = 1, &at
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *fakeQuestionRepo) ListTopics(_ context.Context, kind string) ([]string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []string
	for _, s := range r.sets {
		if s.Kind == kind {
			out = append(out, s.Topic)
		}
	}
	return out, nil
}

// fakeSetGen returns n new part1 sets per call and counts calls.
type fakeSetGen struct {
	calls atomic.Int32
	err   error
	delay time.Duration
}

func (g *fakeSetGen) GenerateSets(ctx context.Context, kind string, avoid []string, n int) ([]domain.QuestionSet, error) {
	g.calls.Add(1)
	if g.delay > 0 {
		time.Sleep(g.delay)
	}
	if g.err != nil {
		return nil, g.err
	}
	var out []domain.QuestionSet
	for i := 0; i < n; i++ {
		out = append(out, domain.QuestionSet{Kind: kind, Topic: uuid.NewString(), Questions: []string{"a?", "b?", "c?", "d?"}, Source: "generated"})
	}
	return out, nil
}

func seededService(t *testing.T, gen QuestionSetGenerator) (*IeltsQuestionService, *fakeQuestionRepo) {
	t.Helper()
	repo := newFakeQuestionRepo()
	svc := NewIeltsQuestionService(repo, gen)
	added, err := svc.Seed(context.Background())
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	if added == 0 {
		t.Fatal("seed added nothing")
	}
	return svc, repo
}

func TestQuestionSeedIsValidAndIdempotent(t *testing.T) {
	svc, repo := seededService(t, nil)
	var part1, cards int
	for _, s := range repo.sets {
		switch s.Kind {
		case domain.QuestionKindPart1:
			part1++
		case domain.QuestionKindCueCard:
			cards++
		}
	}
	if part1 < 20 || cards < 20 {
		t.Fatalf("seed has %d part1 topics and %d cue cards, want at least 20 each", part1, cards)
	}
	again, err := svc.Seed(context.Background())
	if err != nil || again != 0 {
		t.Fatalf("second seed added %d (err %v), want 0", again, err)
	}
}

func TestNextGivesUnseenSetsFirstThenReviewsOldest(t *testing.T) {
	svc, repo := seededService(t, nil) // no generator: the bank stays fixed
	ctx := context.Background()
	user := uuid.New()

	total, _ := repo.CountUnseen(ctx, user, domain.QuestionKindPart1, "part1")
	seen := map[uuid.UUID]bool{}
	base := time.Now()
	for i := 0; i < total; i++ {
		next, err := svc.Next(ctx, user, "part1", nil)
		if err != nil {
			t.Fatal(err)
		}
		if next.Seen || seen[next.Set.ID] {
			t.Fatalf("step %d: got a done set before the bank was finished", i)
		}
		if next.Unseen != total-i {
			t.Fatalf("step %d: unseen = %d, want %d", i, next.Unseen, total-i)
		}
		seen[next.Set.ID] = true
		repo.markDone(user, next.Set.ID, "part1", base.Add(time.Duration(i)*time.Minute))
	}

	next, err := svc.Next(ctx, user, "part1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !next.Seen || next.Unseen != 0 {
		t.Fatalf("after the whole bank: seen=%v unseen=%d, want a review", next.Seen, next.Unseen)
	}
	first, _ := repo.PickOldestDone(ctx, user, domain.QuestionKindPart1, "part1", nil)
	if next.Set.ID != first.ID {
		t.Fatalf("review set = %q, want the one done longest ago %q", next.Set.Topic, first.Topic)
	}

	// Progress is per user and per part: another user, or Part 2, still has everything new.
	other, _ := svc.Next(ctx, uuid.New(), "part1", nil)
	if other.Seen || other.Unseen != total {
		t.Fatalf("other user: seen=%v unseen=%d, want %d new", other.Seen, other.Unseen, total)
	}
	p2, _ := svc.Next(ctx, user, "part2", nil)
	if p2.Seen || p2.Set.Kind != domain.QuestionKindCueCard {
		t.Fatalf("part2 for the same user: %+v", p2)
	}
}

func TestNextExcludeSkipsTheSetOnScreen(t *testing.T) {
	svc, _ := seededService(t, nil)
	ctx := context.Background()
	user := uuid.New()
	cur, _ := svc.Next(ctx, user, "part3", nil)
	for i := 0; i < 20; i++ {
		next, err := svc.Next(ctx, user, "part3", &cur.Set.ID)
		if err != nil {
			t.Fatal(err)
		}
		if next.Set.ID == cur.Set.ID {
			t.Fatal("exclude was ignored")
		}
	}
	if _, err := svc.Next(ctx, user, "opinion", nil); !errors.Is(err, ErrUnknownPart) {
		t.Fatalf("unknown part: err = %v", err)
	}
}

func TestNextGeneratesWhenLearnerIsNearTheEnd(t *testing.T) {
	gen := &fakeSetGen{}
	svc, repo := seededService(t, gen)
	ctx := context.Background()
	user := uuid.New()

	sets, _ := repo.ListWithProgress(ctx, user, domain.QuestionKindPart1, "part1")
	// Leave 2 unseen: below the refill mark, so Next starts one background batch.
	for _, s := range sets[:len(sets)-2] {
		repo.markDone(user, s.ID, "part1", time.Now())
	}
	if _, err := svc.Next(ctx, user, "part1", nil); err != nil {
		t.Fatal(err)
	}
	svc.wg.Wait()
	if gen.calls.Load() != 1 {
		t.Fatalf("generator calls = %d, want 1", gen.calls.Load())
	}
	n, _ := repo.CountUnseen(ctx, user, domain.QuestionKindPart1, "part1")
	if n != 2+questionSetBatchSize {
		t.Fatalf("unseen after refill = %d, want %d", n, 2+questionSetBatchSize)
	}
	// Enough left now: no new batch.
	if _, err := svc.Next(ctx, user, "part1", nil); err != nil {
		t.Fatal(err)
	}
	svc.wg.Wait()
	if gen.calls.Load() != 1 {
		t.Fatalf("generator calls = %d, want still 1", gen.calls.Load())
	}
}

func TestNextWaitsForOneBatchWhenEverythingIsDone(t *testing.T) {
	gen := &fakeSetGen{delay: 50 * time.Millisecond}
	svc, repo := seededService(t, gen)
	ctx := context.Background()
	user := uuid.New()
	sets, _ := repo.ListWithProgress(ctx, user, domain.QuestionKindCueCard, "part2")
	for _, s := range sets {
		repo.markDone(user, s.ID, "part2", time.Now())
	}

	// Parallel requests share one batch.
	var wg sync.WaitGroup
	results := make([]*NextQuestionSet, 4)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			next, err := svc.Next(ctx, user, "part2", nil)
			if err != nil {
				t.Error(err)
				return
			}
			results[i] = next
		}(i)
	}
	wg.Wait()
	svc.wg.Wait()
	for i, r := range results {
		if r == nil || r.Seen || r.Set.Source != "generated" {
			t.Fatalf("request %d: %+v, want a new generated set", i, r)
		}
	}
	if gen.calls.Load() != 1 {
		t.Fatalf("generator calls = %d, want 1 shared batch", gen.calls.Load())
	}
}

func TestFailedGenerationFallsBackToReviewAndCoolsDown(t *testing.T) {
	gen := &fakeSetGen{err: errors.New("429 free quota")}
	svc, repo := seededService(t, gen)
	ctx := context.Background()
	user := uuid.New()
	sets, _ := repo.ListWithProgress(ctx, user, domain.QuestionKindPart1, "part1")
	for _, s := range sets {
		repo.markDone(user, s.ID, "part1", time.Now())
	}
	for i := 0; i < 3; i++ {
		next, err := svc.Next(ctx, user, "part1", nil)
		if err != nil {
			t.Fatal(err)
		}
		if !next.Seen {
			t.Fatal("want a review set when generation fails")
		}
		svc.wg.Wait()
	}
	if gen.calls.Load() != 1 {
		t.Fatalf("generator calls = %d, want 1 (cooldown after a failure)", gen.calls.Load())
	}
	svc.now = func() time.Time { return time.Now().Add(questionSetGenCooldown + time.Minute) }
	if _, err := svc.Next(ctx, user, "part1", nil); err != nil {
		t.Fatal(err)
	}
	svc.wg.Wait()
	if gen.calls.Load() != 2 {
		t.Fatalf("generator calls = %d, want 2 after the cooldown", gen.calls.Load())
	}
}

func TestParseQuestionSetsKeepsOnlyWellFormedNewSets(t *testing.T) {
	reply := `Here you go: {"sets": [
	  {"topic": "Cooking", "questions": ["Do you cook?", "What do you cook?", "Who taught you?", "Do you like it?"]},
	  {"topic": "cooking", "questions": ["A?", "B?", "C?", "D?"]},
	  {"topic": "Weather", "questions": ["Is it hot?", "Do you like rain?", "Which season?", "Why?"]},
	  {"topic": "Rivers", "questions": ["Too few?"]},
	  {"topic": "Parks", "questions": ["No mark", "B?", "C?", "D?"]}
	]} }`
	sets, err := parseQuestionSets(reply, domain.QuestionKindPart1, []string{"Weather"})
	if err != nil {
		t.Fatal(err)
	}
	if len(sets) != 1 || sets[0].Topic != "Cooking" || sets[0].Source != "generated" {
		t.Fatalf("sets = %+v, want only Cooking", sets)
	}

	card := `{"sets": [
	  {"topic": "A song", "prompt": "Describe a song you like.", "points": ["what it is", "when you heard it", "how it sounds", "and explain why you like it"], "part3": ["Why do people like music?", "Is music education useful?", "How has music changed?"]},
	  {"topic": "A shop", "prompt": "Talk about a shop.", "points": ["a", "b", "c", "d"], "part3": ["A?", "B?", "C?"]}
	]}`
	sets, err = parseQuestionSets(card, domain.QuestionKindCueCard, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(sets) != 1 || sets[0].Topic != "A song" || len(sets[0].Points) != 4 || len(sets[0].Questions) != 3 {
		t.Fatalf("cue cards = %+v, want only A song", sets)
	}
	if _, err := parseQuestionSets(`{"sets": []}`, domain.QuestionKindPart1, nil); err == nil {
		t.Fatal("want an error for an empty batch")
	}
}

func TestQuestionSetPromptAsksForOwnWordsAndAvoidsTopics(t *testing.T) {
	p := buildQuestionSetPrompt(domain.QuestionKindCueCard, []string{"A useful skill"}, 5)
	for _, want := range []string{"own words", "Do not copy", "5 new Part 2 cue cards", "- A useful skill", `"part3"`} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt is missing %q:\n%s", want, p)
		}
	}
}
