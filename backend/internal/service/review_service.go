package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

// Weak-word rule, the same as the progress page (db/queries/progress.sql ProgressWeakWords).
const weakWordScore = 60

// A failed review comes back after this delay in the same session ("relearn").
const relearnDelay = 10 * time.Minute

// Short function words are scored unreliably by Azure in connected speech; they are not
// worth reviewing on their own.
var reviewStopwords = map[string]bool{
	"the": true, "and": true, "but": true, "for": true, "are": true, "was": true, "you": true,
	"his": true, "her": true, "its": true, "our": true, "has": true, "had": true, "not": true,
	"can": true, "did": true, "she": true, "him": true, "they": true, "them": true, "this": true,
	"that": true, "with": true, "from": true, "have": true, "were": true, "been": true, "then": true,
}

var nonWordChars = regexp.MustCompile(`[^a-z']`)

// reviewWordKey returns the word as stored ("Photographer," -> "photographer"), or "" when
// it is not worth reviewing.
func reviewWordKey(w string) string {
	k := strings.Trim(nonWordChars.ReplaceAllString(strings.ToLower(w), ""), "'")
	if len(k) < 3 || reviewStopwords[k] {
		return ""
	}
	return k
}

// WeakWords picks the words of an attempt said wrongly: Azure marked them mispronounced or
// scored them under 60. Omitted and inserted words have no usable score.
func WeakWords(scores []domain.WordScore) map[string]float32 {
	out := map[string]float32{}
	for _, ws := range scores {
		if ws.ErrorType != "none" && ws.ErrorType != "mispronunciation" {
			continue
		}
		if ws.ErrorType != "mispronunciation" && ws.AccuracyScore >= weakWordScore {
			continue
		}
		if k := reviewWordKey(ws.Word); k != "" {
			if old, ok := out[k]; !ok || ws.AccuracyScore < old {
				out[k] = ws.AccuracyScore
			}
		}
	}
	return out
}

// ReviewQuality maps an Azure accuracy score of the word to an SM-2 quality (0-5); below 3
// is a failed review.
func ReviewQuality(score float32) int {
	switch {
	case score >= 85:
		return 5
	case score >= 75:
		return 4
	case score >= weakWordScore:
		return 3
	case score >= 40:
		return 2
	default:
		return 1
	}
}

// Schedule applies one review (SM-2) to w at time now.
func Schedule(w *domain.ReviewWord, score float32, now time.Time) {
	q := ReviewQuality(score)
	w.LastScore = score
	if q < 3 {
		if w.Reps > 0 {
			w.Lapses++
		}
		w.Reps = 0
		w.IntervalDays = 0
		w.DueAt = now.Add(relearnDelay)
	} else {
		w.Reps++
		switch w.Reps {
		case 1:
			w.IntervalDays = 1
		case 2:
			w.IntervalDays = 6
		default:
			w.IntervalDays = int(math.Round(float64(w.IntervalDays) * float64(w.Ease)))
		}
		w.DueAt = now.Add(time.Duration(w.IntervalDays) * 24 * time.Hour)
	}
	d := float32(5 - q)
	w.Ease += 0.1 - d*(0.08+d*0.02)
	if w.Ease < 1.3 {
		w.Ease = 1.3
	}
}

type ReviewService struct {
	repo   repository.ReviewRepository
	scorer PronunciationScorer
}

func NewReviewService(repo repository.ReviewRepository, scorer PronunciationScorer) *ReviewService {
	return &ReviewService{repo: repo, scorer: scorer}
}

// AddFromAttempt queues the attempt's weak words for review (due now). Errors are logged:
// review is a side feature and must not fail the attempt.
func (s *ReviewService) AddFromAttempt(ctx context.Context, userID uuid.UUID, scores []domain.WordScore) {
	for word, score := range WeakWords(scores) {
		if err := s.repo.Upsert(ctx, userID, word, score); err != nil {
			log.Printf("review: add %q: %v", word, err)
			return
		}
	}
}

type ReviewQueue struct {
	Due      []*domain.ReviewWord
	Upcoming []*domain.ReviewWord
	DueCount int
	Total    int
}

func (s *ReviewService) Queue(ctx context.Context, userID uuid.UUID) (*ReviewQueue, error) {
	due, err := s.repo.ListDue(ctx, userID, 20)
	if err != nil {
		return nil, fmt.Errorf("list due words: %w", err)
	}
	upcoming, err := s.repo.ListUpcoming(ctx, userID, 10)
	if err != nil {
		return nil, fmt.Errorf("list upcoming words: %w", err)
	}
	dueCount, total, err := s.repo.Count(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("count words: %w", err)
	}
	return &ReviewQueue{Due: due, Upcoming: upcoming, DueCount: dueCount, Total: total}, nil
}

type ReviewResult struct {
	Word     *domain.ReviewWord
	Score    float32
	Quality  int
	Heard    string // what Azure recognised
	Phonemes []domain.PhonemeScore
}

// Review scores the learner saying the word (Azure, the word as reference text) and moves
// it on the schedule.
func (s *ReviewService) Review(ctx context.Context, userID, wordID uuid.UUID, audioWAV []byte) (*ReviewResult, error) {
	w, err := s.repo.Get(ctx, wordID, userID)
	if err != nil {
		return nil, err
	}
	res, err := s.scorer.Score(ctx, TrimSilenceWAV(audioWAV), w.Word)
	if err != nil {
		return nil, fmt.Errorf("score word: %w", err)
	}
	score := res.OverallScore
	for _, ws := range res.WordScores {
		if reviewWordKey(ws.Word) == w.Word {
			if ws.ErrorType == "omission" {
				score = 0
			} else {
				score = ws.AccuracyScore
			}
			break
		}
	}
	Schedule(w, score, time.Now())
	if err := s.repo.UpdateSchedule(ctx, w); err != nil {
		return nil, fmt.Errorf("save schedule: %w", err)
	}
	return &ReviewResult{Word: w, Score: score, Quality: ReviewQuality(score), Heard: res.RecognizedText, Phonemes: res.PhonemeScores}, nil
}

// Remove takes a word off the review list (the learner knows it).
func (s *ReviewService) Remove(ctx context.Context, userID, wordID uuid.UUID) (bool, error) {
	return s.repo.Delete(ctx, wordID, userID)
}
