package domain

import (
	"time"

	"github.com/google/uuid"
)

// Lesson sources and kinds (LISTEN-001).
const (
	LessonAI   = "ai"   // script by the LLM, audio by Azure TTS (shared library)
	LessonVOA  = "voa"  // a VOA Learning English story (public domain)
	LessonMine = "mine" // the learner's own audio or link

	LessonPending = "pending"
	LessonReady   = "ready"
	LessonFailed  = "failed"
)

// LessonKinds are the kinds a lesson may have.
var LessonKinds = []string{"podcast", "conversation", "story", "news", "other"}

// Segment is one line of a lesson transcript. Start and End are seconds in the lesson audio,
// nil when unknown (pasted transcripts).
type Segment struct {
	Speaker string   `json:"speaker"`
	Text    string   `json:"text"`
	Start   *float64 `json:"start"`
	End     *float64 `json:"end"`
}

// Speaker is a voice of an AI lesson.
type Speaker struct {
	Name  string `json:"name"`
	Voice string `json:"voice"`
}

// Lesson is a listening lesson.
type Lesson struct {
	ID          uuid.UUID
	OwnerID     *uuid.UUID // nil = shared
	Source      string
	Kind        string
	Title       string
	Topic       string
	Band        float32
	Segments    []Segment
	Speakers    []Speaker
	Phrases     []string
	AudioPath   string // relative to the audio storage
	AudioURL    string
	VideoURL    string
	DurationSec float32
	SourceURL   string
	Credit      string
	Status      string
	Error       string
	CreatedBy   *uuid.UUID
	CreatedAt   time.Time
	Lines       int // list rows only
	Progress    *LessonProgress
}

// LessonProgress is a learner's progress in a lesson.
type LessonProgress struct {
	PositionSec   float32
	ListenedAt    *time.Time
	DictationBest *float32
	LinesDone     int
}

// NotebookCard is a card of the word notebook: a saved word or phrase, a vocab card or a
// word said wrongly.
type NotebookCard struct {
	ID           uuid.UUID
	Word         string
	Kind         string
	POS          string
	IPA          string
	Meaning      string
	ExampleEN    string
	ExampleMine  bool
	ExampleScore *float32
	Context      string
	LessonID     *uuid.UUID
	LessonTitle  string
	Band         float32
	Misses       int
	LastScore    float32
	IntervalDays int
	Reps         int
	DueAt        time.Time
	CreatedAt    time.Time
}

// SentenceVerdict is the LLM's grading of a learner's sentence for a card.
type SentenceVerdict struct {
	UsesTarget bool    `json:"usesTarget"`
	MeaningOK  bool    `json:"meaningOk"`
	GrammarOK  bool    `json:"grammarOk"`
	Natural    bool    `json:"natural"`
	Score      float32 `json:"score"` // 0-10
	Corrected  string  `json:"corrected"`
	Feedback   string  `json:"feedback"` // in the learner's language
}

// NotebookSentence is a learner's sentence for a card.
type NotebookSentence struct {
	ID           uuid.UUID
	ReviewWordID uuid.UUID
	Text         string
	Score        float32
	Verdict      SentenceVerdict
	Accepted     bool
	PronScore    *float32
	CreatedAt    time.Time
}
