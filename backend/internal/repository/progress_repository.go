package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

// ProgressRepository reads a learner's practice history. tz is an IANA time zone name,
// already validated by the caller.
type ProgressRepository interface {
	// Summary fills everything except Streak (computed by the service from ActiveDayList).
	Summary(ctx context.Context, userID uuid.UUID, tz string, since time.Time, maxRows int) (*domain.ProgressSummary, error)
	// ActiveDayList returns the local dates with at least one attempt, newest first.
	ActiveDayList(ctx context.Context, userID uuid.UUID, tz string) ([]time.Time, error)
}

type progressRepository struct {
	q *sqlcgen.Queries
}

func NewProgressRepository(pool *pgxpool.Pool) ProgressRepository {
	return &progressRepository{q: sqlcgen.New(pool)}
}

func (r *progressRepository) ActiveDayList(ctx context.Context, userID uuid.UUID, tz string) ([]time.Time, error) {
	days, err := r.q.ProgressActiveDays(ctx, sqlcgen.ProgressActiveDaysParams{Tz: tz, UserID: userID})
	if err != nil {
		return nil, err
	}
	out := make([]time.Time, 0, len(days))
	for _, d := range days {
		if d.Valid {
			out = append(out, d.Time)
		}
	}
	return out, nil
}

func (r *progressRepository) Summary(ctx context.Context, userID uuid.UUID, tz string, since time.Time, maxRows int) (*domain.ProgressSummary, error) {
	totals, err := r.q.ProgressTotals(ctx, sqlcgen.ProgressTotalsParams{Tz: tz, UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("totals: %w", err)
	}
	s := &domain.ProgressSummary{
		Attempts:      int(totals.Attempts),
		AttemptsToday: int(totals.AttemptsToday),
		Last30Days: domain.PeriodStats{
			Attempts: int(totals.Attempts30d),
			Accuracy: totals.Accuracy30d,
			Fluency:  totals.Fluency30d,
			Band:     totals.Band30d,
			Banded:   int(totals.Banded30d),
		},
		Weeks:        []domain.WeekStats{},
		HardPhonemes: []domain.PhonemeStats{},
		Criteria:     []domain.CriterionStats{},
		ByTask:       []domain.TaskStats{},
		Graders:      []domain.GraderStats{},
		WeakWords:    []domain.WordStats{},
	}

	weeks, err := r.q.ProgressWeekly(ctx, sqlcgen.ProgressWeeklyParams{
		Tz: tz, UserID: userID, Since: pgtype.Date{Time: since, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("weekly: %w", err)
	}
	for _, w := range weeks {
		s.Weeks = append(s.Weeks, domain.WeekStats{
			Start: w.Week.Time, Attempts: int(w.Attempts), Accuracy: w.Accuracy, Fluency: w.Fluency, Band: w.Band,
		})
	}

	phonemes, err := r.q.ProgressHardPhonemes(ctx, sqlcgen.ProgressHardPhonemesParams{UserID: userID, MaxRows: int32(maxRows)})
	if err != nil {
		return nil, fmt.Errorf("phonemes: %w", err)
	}
	for _, p := range phonemes {
		s.HardPhonemes = append(s.HardPhonemes, domain.PhonemeStats{Phoneme: p.Phoneme, Score: p.Score, Samples: int(p.Samples)})
	}

	criteria, err := r.q.ProgressCriteria(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("criteria: %w", err)
	}
	for _, c := range criteria {
		s.Criteria = append(s.Criteria, domain.CriterionStats{Criterion: c.Criterion, Band: c.Band, Samples: int(c.Samples)})
	}

	tasks, err := r.q.ProgressByTask(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("by task: %w", err)
	}
	for _, t := range tasks {
		s.ByTask = append(s.ByTask, domain.TaskStats{TaskType: t.TaskType, Attempts: int(t.Attempts), AvgBand: t.AvgBand, BestBand: t.BestBand})
	}

	graders, err := r.q.ProgressGraders(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("graders: %w", err)
	}
	for _, g := range graders {
		s.Graders = append(s.Graders, domain.GraderStats{Provider: g.Provider, Model: g.Model, Attempts: int(g.Attempts)})
	}
	secs, err := r.q.ProgressSpeakingSecondsToday(ctx, sqlcgen.ProgressSpeakingSecondsTodayParams{UserID: userID, Tz: tz})
	if err != nil {
		return nil, fmt.Errorf("speaking time: %w", err)
	}
	s.SpeakingSecondsToday = int(secs)

	words, err := r.q.ProgressWeakWords(ctx, sqlcgen.ProgressWeakWordsParams{UserID: userID, MaxRows: int32(maxRows)})
	if err != nil {
		return nil, fmt.Errorf("weak words: %w", err)
	}
	for _, w := range words {
		s.WeakWords = append(s.WeakWords, domain.WordStats{Word: w.Word, Score: w.Score, Times: int(w.Times)})
	}
	return s, nil
}
