package domain

import "time"

// ProgressSummary is one learner's practice history for the Progress page. Azure scores are
// 0–100; IELTS bands are 0–9 and only come from IELTS attempts graded with rubric v2.
type ProgressSummary struct {
	Streak               int // days in a row with at least one attempt, ending today or yesterday
	ActiveDays           int
	Attempts             int
	AttemptsToday        int
	SpeakingSecondsToday int // sum over today's attempts of the end of the last word Azure heard
	Last30Days           PeriodStats
	FirstDay             time.Time   // first local day with practice; zero when none
	Days                 []WeekStats // last days with practice (Start = the day), oldest first
	Weeks                []WeekStats
	HardPhonemes         []PhonemeStats
	Criteria             []CriterionStats
	ByTask               []TaskStats
	Graders              []GraderStats
	WeakWords            []WordStats // words said wrongly in the last 30 days
}

type PeriodStats struct {
	Attempts int
	Accuracy float32 // average Azure accuracy; 0 when no attempt
	Fluency  float32
	Band     float32 // average overall IELTS band; 0 when no banded attempt
	Banded   int     // IELTS attempts with a band
}

type WeekStats struct {
	Start    time.Time // Monday (or the day, in Days), in the learner's time zone
	Attempts int
	Accuracy float32
	Fluency  float32
	Band     float32 // 0 = no banded attempt that week
}

type PhonemeStats struct {
	Phoneme string // Azure phoneme symbol (en-US, e.g. "r", "th", "ae")
	Score   float32
	Samples int
}

type CriterionStats struct {
	Criterion string // fluency_coherence, lexical_resource, grammatical_range_accuracy, pronunciation
	Band      float32
	Samples   int
}

type TaskStats struct {
	TaskType string
	Attempts int
	AvgBand  float32
	BestBand float32
}

type GraderStats struct {
	Provider string // "" = no LLM (grading failed or before grader tracking)
	Model    string
	Attempts int
}

type WordStats struct {
	Word  string
	Score float32 // average Azure accuracy for the word
	Times int
}
