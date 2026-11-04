package domain

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	Level        *string
	TargetGoal   *string
	SelfBand     *float32 // learner's own estimate of their band (until measured)
	TargetBand   *float32
	Lang         string // the learner's language (internal/i18n): UI, AI feedback, meanings
	CreatedAt    time.Time
}

type RefreshToken struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
	Remember  bool // false: session cookie, short TTL ("remember me" unticked)
}
