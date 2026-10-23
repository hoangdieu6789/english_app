package service

import (
	"context"

	"englishapp/backend/internal/domain"
)

type ScoreResult struct {
	RecognizedText string
	OverallScore   float32
	FluencyScore   float32
	WordScores     []domain.WordScore
	PhonemeScores  []domain.PhonemeScore
}

// PronunciationScorer abstracts the pronunciation-assessment provider so the
// business logic doesn't depend on Azure specifically — swapping to Whisper
// or Google Speech later only means writing a new implementation of this
// interface, not touching PronunciationService.
type PronunciationScorer interface {
	Score(ctx context.Context, audioWAV []byte, referenceText string) (*ScoreResult, error)
}
