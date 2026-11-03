package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

// Seed question bank, written for this app in its own words (no questions copied from IELTS
// books or exam websites). It is inserted on every start; existing topics are skipped.
//
//go:embed ielts_question_seed.json
var questionSeedJSON []byte

const (
	// One LLM call writes a batch of sets, shared by every learner.
	questionSetBatchSize = 5
	// A batch starts in the background when a learner has fewer unseen sets than this left.
	questionSetRefillBelow = 3
	questionSetGenTimeout  = 90 * time.Second
	// After a failed or empty batch, wait before trying again (free quota is 50 requests/day).
	questionSetGenCooldown = 10 * time.Minute
)

var ErrUnknownPart = errors.New("unknown IELTS part")

// QuestionKindForPart maps an IELTS part to the kind of set it uses.
func QuestionKindForPart(part string) (string, error) {
	switch part {
	case "part1":
		return domain.QuestionKindPart1, nil
	case "part2", "part3":
		return domain.QuestionKindCueCard, nil
	}
	return "", ErrUnknownPart
}

// NextQuestionSet is the set to practise next.
type NextQuestionSet struct {
	Set *domain.QuestionSet
	// Seen is true when the learner has already done every set, so this one is a review.
	Seen bool
	// Unseen is how many sets the learner has not done yet for this part (this one included).
	Unseen int
}

// IeltsQuestionService gives each learner the sets they have not done yet, lets them redo
// done sets, and asks the LLM for new sets when a learner is close to the end of the bank.
type IeltsQuestionService struct {
	repo repository.QuestionSetRepository
	gen  QuestionSetGenerator // nil = no generation; the seed bank only
	now  func() time.Time

	genLocks   sync.Map // kind -> *sync.Mutex: one batch per kind at a time
	generating sync.Map // kind -> struct{}: at most one background batch per kind
	cooldown   sync.Map // kind -> time.Time: no new batch before this time
	wg         sync.WaitGroup
}

func NewIeltsQuestionService(repo repository.QuestionSetRepository, gen QuestionSetGenerator) *IeltsQuestionService {
	return &IeltsQuestionService{repo: repo, gen: gen, now: time.Now}
}

// Seed inserts the built-in sets that are not in the database yet.
func (s *IeltsQuestionService) Seed(ctx context.Context) (int, error) {
	var seed struct {
		Part1    []rawQuestionSet `json:"part1"`
		CueCards []rawQuestionSet `json:"cue_cards"`
	}
	if err := json.Unmarshal(questionSeedJSON, &seed); err != nil {
		return 0, fmt.Errorf("parse question seed: %w", err)
	}
	added := 0
	for kind, raws := range map[string][]rawQuestionSet{
		domain.QuestionKindPart1:   seed.Part1,
		domain.QuestionKindCueCard: seed.CueCards,
	} {
		for _, raw := range raws {
			set, ok := raw.toQuestionSet(kind, "seed")
			if !ok {
				return added, fmt.Errorf("question seed: bad %s set %q", kind, raw.Topic)
			}
			ok, err := s.repo.Insert(ctx, set)
			if err != nil {
				return added, fmt.Errorf("insert seed set %q: %w", set.Topic, err)
			}
			if ok {
				added++
			}
		}
	}
	return added, nil
}

// Get returns a set by id; nil when it does not exist.
func (s *IeltsQuestionService) Get(ctx context.Context, id uuid.UUID) (*domain.QuestionSet, error) {
	return s.repo.Get(ctx, id)
}

// List returns every set for the part with the learner's progress (done sets first).
func (s *IeltsQuestionService) List(ctx context.Context, userID uuid.UUID, part string) ([]domain.QuestionSetProgress, error) {
	kind, err := QuestionKindForPart(part)
	if err != nil {
		return nil, err
	}
	return s.repo.ListWithProgress(ctx, userID, kind, part)
}

// Next returns a set the learner has not done for this part. When every set is done, it
// tries one LLM batch; if that gives nothing, it returns the set done longest ago (review).
// exclude skips the set on screen ("another topic").
func (s *IeltsQuestionService) Next(ctx context.Context, userID uuid.UUID, part string, exclude *uuid.UUID) (*NextQuestionSet, error) {
	kind, err := QuestionKindForPart(part)
	if err != nil {
		return nil, err
	}
	set, err := s.repo.PickUnseen(ctx, userID, kind, part, exclude)
	if err != nil {
		return nil, fmt.Errorf("pick unseen set: %w", err)
	}
	if set == nil && exclude == nil {
		// Every set is done: wait for one batch instead of repeating at once.
		genCtx, cancel := context.WithTimeout(ctx, questionSetGenTimeout)
		if err := s.generate(genCtx, userID, kind, part, 1); err != nil {
			log.Printf("ielts questions: generate: %v", err)
		}
		cancel()
		if set, err = s.repo.PickUnseen(ctx, userID, kind, part, nil); err != nil {
			return nil, fmt.Errorf("pick unseen set: %w", err)
		}
	}
	next := &NextQuestionSet{Set: set}
	if set == nil {
		next.Seen = true
		if set, err = s.repo.PickOldestDone(ctx, userID, kind, part, exclude); err != nil {
			return nil, fmt.Errorf("pick done set: %w", err)
		}
		if set == nil && exclude != nil { // only one set exists
			set, err = s.repo.Get(ctx, *exclude)
			if err != nil {
				return nil, err
			}
		}
		if set == nil {
			return nil, fmt.Errorf("no %s question sets", kind)
		}
		next.Set = set
	}

	if next.Unseen, err = s.repo.CountUnseen(ctx, userID, kind, part); err != nil {
		return nil, fmt.Errorf("count unseen sets: %w", err)
	}
	// Top up in the background before the learner runs out, so they rarely wait for the LLM.
	if next.Unseen < questionSetRefillBelow {
		s.generateAsync(userID, kind, part)
	}
	return next, nil
}

func (s *IeltsQuestionService) generateAsync(userID uuid.UUID, kind, part string) {
	if s.gen == nil || s.coolingDown(kind) {
		return
	}
	if _, busy := s.generating.LoadOrStore(kind, struct{}{}); busy {
		return
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.generating.Delete(kind)
		ctx, cancel := context.WithTimeout(context.Background(), questionSetGenTimeout)
		defer cancel()
		if err := s.generate(ctx, userID, kind, part, questionSetRefillBelow); err != nil {
			log.Printf("ielts questions: background generate: %v", err)
		}
	}()
}

// generate writes one batch if the learner has fewer than below unseen sets. Batches for the
// same kind run one at a time; each re-checks after waiting, so parallel callers share one.
func (s *IeltsQuestionService) generate(ctx context.Context, userID uuid.UUID, kind, part string, below int) error {
	if s.gen == nil {
		return nil
	}
	l, _ := s.genLocks.LoadOrStore(kind, &sync.Mutex{})
	mu := l.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	if s.coolingDown(kind) {
		return nil
	}
	n, err := s.repo.CountUnseen(ctx, userID, kind, part)
	if err != nil {
		return fmt.Errorf("count unseen sets: %w", err)
	}
	if n >= below {
		return nil
	}
	topics, err := s.repo.ListTopics(ctx, kind)
	if err != nil {
		return fmt.Errorf("list topics: %w", err)
	}
	started := s.now()
	sets, err := s.gen.GenerateSets(ctx, kind, topics, questionSetBatchSize)
	if err != nil {
		s.cooldown.Store(kind, s.now().Add(questionSetGenCooldown))
		return err
	}
	added := 0
	for _, set := range sets {
		ok, err := s.repo.Insert(ctx, set)
		if err != nil {
			return fmt.Errorf("insert generated set: %w", err)
		}
		if ok {
			added++
		}
	}
	if added == 0 {
		s.cooldown.Store(kind, s.now().Add(questionSetGenCooldown))
	}
	log.Printf("ielts questions: kind=%s generated=%d added=%d took=%s", kind, len(sets), added, s.now().Sub(started).Round(time.Millisecond))
	return nil
}

func (s *IeltsQuestionService) coolingDown(kind string) bool {
	until, ok := s.cooldown.Load(kind)
	return ok && s.now().Before(until.(time.Time))
}
