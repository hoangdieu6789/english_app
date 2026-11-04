package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

type ReviewRepository interface {
	Upsert(ctx context.Context, userID uuid.UUID, word string, score float32) error
	ListDue(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error)
	ListUpcoming(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error)
	Count(ctx context.Context, userID uuid.UUID) (due, total int, err error)
	// Get returns ErrNotFound when the word does not exist or belongs to another user.
	Get(ctx context.Context, id, userID uuid.UUID) (*domain.ReviewWord, error)
	UpdateSchedule(ctx context.Context, w *domain.ReviewWord) error
	// Delete reports false when nothing was deleted.
	Delete(ctx context.Context, id, userID uuid.UUID) (bool, error)
}

type reviewRepository struct {
	q *sqlcgen.Queries
}

func NewReviewRepository(pool *pgxpool.Pool) ReviewRepository {
	return &reviewRepository{q: sqlcgen.New(pool)}
}

func (r *reviewRepository) Upsert(ctx context.Context, userID uuid.UUID, word string, score float32) error {
	return r.q.UpsertReviewWord(ctx, sqlcgen.UpsertReviewWordParams{UserID: userID, Word: word, LastScore: score})
}

func (r *reviewRepository) ListDue(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error) {
	rows, err := r.q.ListDueReviewWords(ctx, sqlcgen.ListDueReviewWordsParams{UserID: userID, Limit: int32(limit)})
	return toDomainReviewWords(rows), err
}

func (r *reviewRepository) ListUpcoming(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error) {
	rows, err := r.q.ListUpcomingReviewWords(ctx, sqlcgen.ListUpcomingReviewWordsParams{UserID: userID, Limit: int32(limit)})
	return toDomainReviewWords(rows), err
}

func (r *reviewRepository) Count(ctx context.Context, userID uuid.UUID) (int, int, error) {
	row, err := r.q.CountReviewWords(ctx, userID)
	return int(row.Due), int(row.Total), err
}

func (r *reviewRepository) Get(ctx context.Context, id, userID uuid.UUID) (*domain.ReviewWord, error) {
	row, err := r.q.GetReviewWord(ctx, sqlcgen.GetReviewWordParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return toDomainReviewWord(row), nil
}

func (r *reviewRepository) UpdateSchedule(ctx context.Context, w *domain.ReviewWord) error {
	return r.q.UpdateReviewWordSchedule(ctx, sqlcgen.UpdateReviewWordScheduleParams{
		ID:           w.ID,
		LastScore:    w.LastScore,
		Ease:         w.Ease,
		IntervalDays: int32(w.IntervalDays),
		Reps:         int32(w.Reps),
		Lapses:       int32(w.Lapses),
		DueAt:        pgtype.Timestamptz{Time: w.DueAt, Valid: true},
	})
}

func (r *reviewRepository) Delete(ctx context.Context, id, userID uuid.UUID) (bool, error) {
	n, err := r.q.DeleteReviewWord(ctx, sqlcgen.DeleteReviewWordParams{ID: id, UserID: userID})
	return n > 0, err
}

func toDomainReviewWords(rows []sqlcgen.ReviewWord) []*domain.ReviewWord {
	out := make([]*domain.ReviewWord, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainReviewWord(row))
	}
	return out
}

func toDomainReviewWord(row sqlcgen.ReviewWord) *domain.ReviewWord {
	w := &domain.ReviewWord{
		ID:           row.ID,
		UserID:       row.UserID,
		Word:         row.Word,
		LastScore:    row.LastScore,
		Ease:         row.Ease,
		IntervalDays: int(row.IntervalDays),
		Reps:         int(row.Reps),
		Lapses:       int(row.Lapses),
		DueAt:        row.DueAt.Time,
		CreatedAt:    row.CreatedAt.Time,
	}
	if row.LastReviewedAt.Valid {
		w.LastReviewedAt = &row.LastReviewedAt.Time
	}
	return w
}
