package domain

import (
	"time"

	"github.com/google/uuid"
)

type ProgressSnapshot struct {
	ID            uuid.UUID
	UserID        uuid.UUID
	WeekOf        time.Time
	AvgAccuracy   float32
	AvgFluency    float32
	VocabMastered int
	Streak        int
}

type Session struct {
	ID                 uuid.UUID
	UserID             uuid.UUID
	Date               time.Time
	ListeningMinutes   int
	SpeakingMinutes    int
	ExercisesCompleted int
}
