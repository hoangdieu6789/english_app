package domain

import (
	"time"

	"github.com/google/uuid"
)

type PronunciationAttempt struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	AudioURL       string
	ReferenceText  string
	RecognizedText *string
	OverallScore   float32
	FluencyScore   float32
	WordScores     []WordScore
	PhonemeScores  []PhonemeScore
	CreatedAt      time.Time
}

type WordScore struct {
	Word          string  `json:"word"`
	AccuracyScore float32 `json:"accuracyScore"`
	ErrorType     string  `json:"errorType"` // none | mispronunciation | omission | insertion
}

type PhonemeScore struct {
	Phoneme string  `json:"phoneme"`
	Score   float32 `json:"score"`
}
