package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
)

const (
	progressWeeks    = 6 // weeks on the chart, including the current one
	progressListRows = 5 // hardest phonemes and weak words shown
)

type ProgressService struct {
	repo repository.ProgressRepository
	now  func() time.Time
}

func NewProgressService(repo repository.ProgressRepository) *ProgressService {
	return &ProgressService{repo: repo, now: time.Now}
}

// Summary returns the learner's progress, with days and weeks in loc.
func (s *ProgressService) Summary(ctx context.Context, userID uuid.UUID, loc *time.Location) (*domain.ProgressSummary, error) {
	today := dateIn(s.now(), loc)
	monday := today.AddDate(0, 0, -((int(today.Weekday()) + 6) % 7))
	since := monday.AddDate(0, 0, -7*(progressWeeks-1))

	sum, err := s.repo.Summary(ctx, userID, loc.String(), since, progressListRows)
	if err != nil {
		return nil, fmt.Errorf("progress summary: %w", err)
	}
	days, err := s.repo.ActiveDayList(ctx, userID, loc.String())
	if err != nil {
		return nil, fmt.Errorf("progress active days: %w", err)
	}
	sum.ActiveDays = len(days)
	sum.Streak = Streak(days, today)
	return sum, nil
}

// Streak counts consecutive days with practice, newest first. It ends today, or yesterday
// when the learner has not practised yet today (the streak is not lost until the day ends).
func Streak(daysDesc []time.Time, today time.Time) int {
	if len(daysDesc) == 0 {
		return 0
	}
	want := today
	if !sameDate(daysDesc[0], today) {
		want = today.AddDate(0, 0, -1)
	}
	n := 0
	for _, d := range daysDesc {
		if !sameDate(d, want) {
			break
		}
		n++
		want = want.AddDate(0, 0, -1)
	}
	return n
}

// dateIn returns midnight of t's calendar date in loc, as a UTC date value (like DB dates).
func dateIn(t time.Time, loc *time.Location) time.Time {
	y, m, d := t.In(loc).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func sameDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
