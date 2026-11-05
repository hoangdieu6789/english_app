package domain

import (
	"time"

	"github.com/google/uuid"
)

// Vocabulary games (docs/tickets/GAME-001-vocab-games-plan.md).

// GameCard is one word in a game deck, with its meaning in the learner's language.
type GameCard struct {
	ID                 uuid.UUID
	Word               string
	Band               float32
	POS                string
	IPA                string
	Meaning            string
	ExampleEN          string
	ExampleTranslation string
	Missed             bool // answered wrongly in a game since the last review
}

// GameAnswer is the learner's answer to one card in a game.
type GameAnswer struct {
	WordID  uuid.UUID
	Correct bool
}

// GamePlay is one finished game.
type GamePlay struct {
	UserID     uuid.UUID
	Game       string
	Deck       string
	Score      int
	Correct    int
	Total      int
	DurationMS int
	Level      int // Level Climb only; 0 = none
	Answers    []GameAnswer
}

// GameBest is the learner's best score in one game.
type GameBest struct {
	Game       string
	Best       int
	Plays      int
	LastPlayed time.Time
}
