package domain

import (
	"time"

	"github.com/google/uuid"
)

type VocabGap struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	Word            string
	GapType         string // listening_gap | pronunciation_gap | never_seen
	OccurrenceCount int
	LastScore       *float32
	Status          string // new | reviewing | mastered
	NextReviewDate  *time.Time
	FirstSeenAt     time.Time
}
