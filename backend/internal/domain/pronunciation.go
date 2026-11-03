package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Grading status of an attempt.
const (
	GradingPending = "pending"
	GradingDone    = "done"
	GradingFailed  = "failed"
)

// GradingUpdate is the final result of the background LLM step.
type GradingUpdate struct {
	Rubric         json.RawMessage
	RubricScore    *float32
	CEFRLevel      *string
	RubricVersion  *string
	GraderProvider *string
	GraderModel    *string
	Status         string
}

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
	QuestionSetID     *uuid.UUID // IELTS question set answered; nil for shadowing
	TaskPrompt        *string    // the question or cue card answered
	GraderProvider    *string    // LLM provider that scored FC/LR/GRA (claude, gemini, openrouter); nil = no LLM
	GraderModel       *string    // model id reported by that provider
	GradingStatus     string     // pending (LLM step running), done, failed; see migration 000007
	TranscriptSource  *string    // azure (its own recognition) or whisper; nil for attempts before migration 000009
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
