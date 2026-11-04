package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/repository"
)

const (
	recentSentenceHistoryLimit = 30
	// One LLM call fills the queue with a batch; a background refill starts when it runs low,
	// so the learner almost never waits for the LLM.
	sentenceBatchSize   = 10
	sentenceRefillBelow = 3
	sentenceRefillTTL   = 2 * time.Minute
)

// A new learner's first sentences come from this fixed list, so the first Shadowing sentence
// shows at once instead of after a ~17 s LLM batch. The LLM refills the queue in the
// background when it runs low.
//
// starterGlossLang is the language of the glosses in practice_sentence_starters.json.
const starterGlossLang = "vi"

//go:embed practice_sentence_starters.json
var starterSentencesJSON []byte

func loadStarterSentences(minWords int) []GeneratedSentence {
	var all []GeneratedSentence
	if err := json.Unmarshal(starterSentencesJSON, &all); err != nil {
		panic(fmt.Sprintf("practice_sentence_starters.json: %v", err))
	}
	out := all[:0]
	for _, s := range all {
		if countWords(s.Text) >= minWords {
			out = append(out, s)
		}
	}
	return out
}

type PracticeSentenceService struct {
	generator SentenceGenerator
	repo      repository.PracticeSentenceRepository
	minWords  int                 // rubric Pronunciation needs this many words (rubric.yaml min_words)
	starters  []GeneratedSentence // first queue of a new learner (no LLM call)

	fillLocks sync.Map // userID -> *sync.Mutex: one LLM batch per user at a time
	refilling sync.Map // userID -> struct{}: at most one background refill goroutine per user
	wg        sync.WaitGroup
}

func NewPracticeSentenceService(generator SentenceGenerator, repo repository.PracticeSentenceRepository, minWords int) *PracticeSentenceService {
	return &PracticeSentenceService{generator: generator, repo: repo, minWords: minWords, starters: loadStarterSentences(minWords)}
}

// NextSentence returns the next queued sentence. Only an empty queue (first use) waits for
// the LLM; otherwise the sentence comes from the database and the queue is topped up in the
// background.
// The gloss is returned only when it is in lang (sentences queued before the learner changed
// language keep their old gloss, which is hidden).
func (s *PracticeSentenceService) NextSentence(ctx context.Context, userID uuid.UUID, lang string) (*domain.PracticeSentence, error) {
	lang = i18n.Normalize(lang)
	sentence, err := s.repo.ClaimNext(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("claim queued sentence: %w", err)
	}
	if sentence == nil {
		// Waits for a background refill that is already running instead of paying for a second batch.
		if err := s.fillBelow(ctx, userID, 1, lang); err != nil {
			return nil, err
		}
		if sentence, err = s.repo.ClaimNext(ctx, userID); err != nil {
			return nil, fmt.Errorf("claim queued sentence: %w", err)
		}
		if sentence == nil {
			return nil, fmt.Errorf("sentence queue still empty after generating")
		}
	}

	if n, err := s.repo.CountQueued(ctx, userID); err == nil && n < sentenceRefillBelow {
		s.refillAsync(userID, lang)
	}
	if sentence.GlossLang != lang {
		sentence.Gloss = s.starterGloss(sentence.Text, lang) // "" unless a starter glossed in lang
	}
	return sentence, nil
}

func (s *PracticeSentenceService) refillAsync(userID uuid.UUID, lang string) {
	if _, busy := s.refilling.LoadOrStore(userID, struct{}{}); busy {
		return
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		defer s.refilling.Delete(userID)
		ctx, cancel := context.WithTimeout(context.Background(), sentenceRefillTTL)
		defer cancel()
		if err := s.fillBelow(ctx, userID, sentenceRefillBelow, lang); err != nil {
			log.Printf("practice sentences: background refill: %v", err)
		}
	}()
}

// fillBelow generates one batch if fewer than min sentences are queued. Calls for the same
// user run one at a time, and each re-checks the queue after waiting.
func (s *PracticeSentenceService) fillBelow(ctx context.Context, userID uuid.UUID, min int, lang string) error {
	l, _ := s.fillLocks.LoadOrStore(userID, &sync.Mutex{})
	mu := l.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	n, err := s.repo.CountQueued(ctx, userID)
	if err != nil {
		return fmt.Errorf("count queued sentences: %w", err)
	}
	if n >= min {
		return nil
	}
	recent, err := s.repo.ListRecentTexts(ctx, userID, recentSentenceHistoryLimit)
	if err != nil {
		return fmt.Errorf("list recent sentences: %w", err)
	}
	if len(recent) == 0 && len(s.starters) > 0 {
		// A new learner: the fixed starter list, no LLM wait.
		for _, g := range s.starters {
			gloss := g.Gloss // the starters are glossed in Vietnamese only
			if lang != starterGlossLang {
				gloss = ""
			}
			if _, err := s.repo.Create(ctx, userID, g.Text, g.Phonetic, gloss, lang); err != nil {
				return fmt.Errorf("save starter sentence: %w", err)
			}
		}
		return nil
	}
	batch, err := s.generator.GenerateBatch(ctx, recent, sentenceBatchSize, s.minWords, lang)
	if err != nil {
		return fmt.Errorf("generate sentences: %w", err)
	}
	for _, g := range batch {
		if _, err := s.repo.Create(ctx, userID, g.Text, g.Phonetic, g.Gloss, lang); err != nil {
			return fmt.Errorf("save generated sentence: %w", err)
		}
	}
	return nil
}

func countWords(s string) int { return len(strings.Fields(s)) }

// starterGloss returns the built-in gloss of a starter sentence when lang is the starters'
// gloss language, else "".
func (s *PracticeSentenceService) starterGloss(text, lang string) string {
	if lang != starterGlossLang {
		return ""
	}
	for _, g := range s.starters {
		if g.Text == text {
			return g.Gloss
		}
	}
	return ""
}
