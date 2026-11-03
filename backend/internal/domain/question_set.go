package domain

import (
	"time"

	"github.com/google/uuid"
)

// Question set kinds. A cue card set serves both Part 2 (the card) and Part 3 (its questions).
const (
	QuestionKindPart1   = "part1"
	QuestionKindCueCard = "cue_card"
)

// QuestionSet is one IELTS practice topic shared by all learners.
type QuestionSet struct {
	ID        uuid.UUID
	Kind      string   // QuestionKindPart1 or QuestionKindCueCard
	Topic     string   // short name, unique per kind
	Prompt    string   // cue card task ("Describe ..."); empty for part1
	Points    []string // cue card "You should say" points
	Questions []string // part1 questions, or the Part 3 questions of a cue card
	Source    string   // "seed" (ships with the app) or "generated" (written by the LLM)
	CreatedAt time.Time
}

// QuestionSetProgress is a set with one learner's history for one task type.
type QuestionSetProgress struct {
	QuestionSet
	AttemptCount  int
	LastAttemptAt *time.Time
	BestBand      *float32 // best overall IELTS band; nil when no attempt has a band
}
