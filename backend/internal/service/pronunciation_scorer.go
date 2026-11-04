package service

import (
	"context"

	"englishapp/backend/internal/domain"
)

type ScoreResult struct {
	RecognizedText    string
	OverallScore      float32 // AccuracyScore
	FluencyScore      float32
	CompletenessScore float32
	ProsodyScore      *float32 // nil when prosody is not available (locale other than en-US)
	PronScore         float32
	WordScores        []domain.WordScore
	PhonemeScores     []domain.PhonemeScore
	// Raw is the provider's response body, kept so the attempt can be re-scored later
	// (e.g. by the speaking rubric when its thresholds change).
	Raw []byte
}

// PronunciationScorer abstracts the pronunciation-assessment provider so the
// business logic doesn't depend on Azure specifically — swapping to Whisper
// or Google Speech later only means writing a new implementation of this
// interface, not touching PronunciationService.
//
// An empty referenceText means unscripted speech (free answer, no sentence to read).
type PronunciationScorer interface {
	Score(ctx context.Context, audioWAV []byte, referenceText string) (*ScoreResult, error)
	// ScoreTranscribed scores free speech against a transcript of the same audio.
	ScoreTranscribed(ctx context.Context, audioWAV []byte, transcript string) (*ScoreResult, error)
}
