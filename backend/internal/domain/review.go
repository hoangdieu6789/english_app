package domain

import (
	"time"

	"github.com/google/uuid"
)

// ReviewWord is a word the learner said wrongly, on a spaced-repetition schedule.
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
}
