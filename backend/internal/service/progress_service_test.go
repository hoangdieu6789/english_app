package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
)

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestStreak(t *testing.T) {
	today := day("2026-11-03")
	cases := []struct {
		name string
		days []string
		want int
	}{
		{"no practice", nil, 0},
		{"today only", []string{"2026-11-03"}, 1},
		{"three days ending today", []string{"2026-11-03", "2026-11-02", "2026-11-01"}, 3},
		{"not yet today, kept from yesterday", []string{"2026-11-02", "2026-11-01"}, 2},
		{"broken two days ago", []string{"2026-11-01", "2026-10-31"}, 0},
		{"gap stops the count", []string{"2026-11-03", "2026-11-02", "2026-10-30"}, 2},
		{"across a month", []string{"2026-11-03", "2026-11-02", "2026-11-01", "2026-10-31"}, 4},
	}
	for _, c := range cases {
		var days []time.Time
		for _, d := range c.days {
			days = append(days, day(d))
		}
		if got := Streak(days, today); got != c.want {
			t.Errorf("%s: streak = %d, want %d", c.name, got, c.want)
		}
	}
}

type fakeProgressRepo struct {
	tz, gotTZ string
	since     time.Time
	days      []time.Time
	daysSince time.Time
}

func (f *fakeProgressRepo) Summary(_ context.Context, _ uuid.UUID, tz string, since, daysSince time.Time, _ int) (*domain.ProgressSummary, error) {
	f.gotTZ, f.since, f.daysSince = tz, since, daysSince
	return &domain.ProgressSummary{Attempts: 3}, nil
}

func (f *fakeProgressRepo) ActiveDayList(context.Context, uuid.UUID, string) ([]time.Time, error) {
	return f.days, nil
}

func TestProgressSummaryUsesLearnerDayAndChartRange(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		t.Fatal(err)
	}
	repo := &fakeProgressRepo{days: []time.Time{day("2026-11-04"), day("2026-11-03")}}
	svc := NewProgressService(repo)
	// 2026-11-03 18:30 UTC is already Wednesday 2026-11-04 01:30 in Vietnam.
	svc.now = func() time.Time { return time.Date(2026, 11, 3, 18, 30, 0, 0, time.UTC) }

	sum, err := svc.Summary(context.Background(), uuid.New(), loc)
	if err != nil {
		t.Fatal(err)
	}
	if sum.Streak != 2 || sum.ActiveDays != 2 {
		t.Fatalf("streak=%d active=%d, want 2 and 2 (today is the 4th in Vietnam)", sum.Streak, sum.ActiveDays)
	}
	if repo.gotTZ != "Asia/Ho_Chi_Minh" {
		t.Fatalf("tz = %q", repo.gotTZ)
	}
	// Week of Mon 2026-11-02 plus 9 earlier weeks; days: today plus 13 earlier days.
	if !sameDate(repo.since, day("2026-08-31")) {
		t.Fatalf("weeks since = %s, want 2026-08-31", repo.since.Format("2006-01-02"))
	}
	if !sameDate(repo.daysSince, day("2026-10-22")) {
		t.Fatalf("days since = %s, want 2026-10-22", repo.daysSince.Format("2006-01-02"))
	}
	if !sameDate(sum.FirstDay, day("2026-11-03")) {
		t.Fatalf("first day = %s, want 2026-11-03", sum.FirstDay.Format("2006-01-02"))
	}
}
