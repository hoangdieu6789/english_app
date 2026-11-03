package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type PronunciationAttempt struct {
	ID                uuid.UUID
	UserID            uuid.UUID
	AudioURL          string
	ReferenceText     string
	RecognizedText    *string
	TaskType          string // "shadowing" or an IELTS part: part1 | part2 | part3 | full_test
	OverallScore      float32
	FluencyScore      float32
	CompletenessScore *float32
	ProsodyScore      *float32
	PronScore         *float32
	WordScores        []WordScore
	PhonemeScores     []PhonemeScore
	AzureResult       json.RawMessage // raw provider response, for re-scoring
	Rubric            json.RawMessage // rubric.Result as JSON; nil when grading failed
	RubricScore       *float32        // overall IELTS band (0–9, half bands); nil when no band
	CEFRLevel         *string
	RubricVersion     *string
	CreatedAt         time.Time
}

type WordScore struct {
	Word          string  `json:"word"`
	AccuracyScore float32 `json:"accuracyScore"`
	ErrorType     string  `json:"errorType"` // none | mispronunciation | omission | insertion
	// Prosody feedback (only when prosody assessment is enabled).
	OffsetMs        int64 `json:"offsetMs,omitempty"`
	DurationMs      int64 `json:"durationMs,omitempty"`
	UnexpectedBreak bool  `json:"unexpectedBreak,omitempty"`
	MissingBreak    bool  `json:"missingBreak,omitempty"`
	Monotone        bool  `json:"monotone,omitempty"`
}

type PhonemeScore struct {
	Phoneme string  `json:"phoneme"`
	Score   float32 `json:"score"`
}
