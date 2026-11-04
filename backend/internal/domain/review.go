package domain

import (
	"time"

	"github.com/google/uuid"
)

// Review card kinds.
const (
	ReviewPronunciation = "pronunciation" // a word the learner said wrongly
	ReviewVocab         = "vocab"         // a new word for the learner's band
)

// VocabInfo is the dictionary side of a vocab card (written by the LLM, shared).
type VocabInfo struct {
	POS       string
	IPA       string
	MeaningVI string
	ExampleEN string
	ExampleVI string
	Band      float32
}

// VocabWord is an NGSL/NAWL headword with its band estimate and LLM-written details.
type VocabWord struct {
	ID       uuid.UUID
	Word     string
	Source   string
	Rank     int
	Band     float32
	Info     VocabInfo
	Enriched bool
}

// ReviewWord is a review card on a spaced-repetition schedule.
type ReviewWord struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	Word           string
	LastScore      float32 // latest Azure accuracy (0-100)
	Ease           float32
	IntervalDays   int
	Reps           int
	Lapses         int
	DueAt          time.Time
	LastReviewedAt *time.Time
	CreatedAt      time.Time
	Kind           string // ReviewPronunciation | ReviewVocab
	Misses         int    // pronunciation: attempts in which it was said wrongly
	MinScore       float32
	Vocab          *VocabInfo // vocab cards only
}
