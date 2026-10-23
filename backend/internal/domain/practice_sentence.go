package domain

import (
	"time"

	"github.com/google/uuid"
)

type PracticeSentence struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Text      string
	Phonetic  string
	Gloss     string
	CreatedAt time.Time
}
