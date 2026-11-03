package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

// PracticeSentenceRepository stores practice sentences. New sentences are queued and shown
// one by one (ClaimNext), so one LLM call can fill the queue with a whole batch.
type PracticeSentenceRepository interface {
	// Create adds a sentence to the user's queue.
	Create(ctx context.Context, userID uuid.UUID, text, phonetic, gloss string) (*domain.PracticeSentence, error)
	// ClaimNext marks the oldest queued sentence as shown and returns it; nil when the queue is empty.
	ClaimNext(ctx context.Context, userID uuid.UUID) (*domain.PracticeSentence, error)
	CountQueued(ctx context.Context, userID uuid.UUID) (int, error)
	// ListRecentTexts returns shown and queued sentences, newest first.
	ListRecentTexts(ctx context.Context, userID uuid.UUID, limit int) ([]string, error)
}

type practiceSentenceRepository struct {
	q *sqlcgen.Queries
}

func NewPracticeSentenceRepository(pool *pgxpool.Pool) PracticeSentenceRepository {
	return &practiceSentenceRepository{q: sqlcgen.New(pool)}
}

func toPracticeSentence(row sqlcgen.PracticeSentence) *domain.PracticeSentence {
	return &domain.PracticeSentence{
		ID:        row.ID,
		UserID:    row.UserID,
		Text:      row.Text,
		Phonetic:  row.Phonetic,
		Gloss:     row.Gloss,
		CreatedAt: row.CreatedAt.Time,
	}
}

func (r *practiceSentenceRepository) Create(ctx context.Context, userID uuid.UUID, text, phonetic, gloss string) (*domain.PracticeSentence, error) {
	row, err := r.q.CreatePracticeSentence(ctx, sqlcgen.CreatePracticeSentenceParams{
		UserID:   userID,
		Text:     text,
		Phonetic: phonetic,
		Gloss:    gloss,
	})
	if err != nil {
		return nil, err
	}
	return toPracticeSentence(row), nil
}

func (r *practiceSentenceRepository) ClaimNext(ctx context.Context, userID uuid.UUID) (*domain.PracticeSentence, error) {
	row, err := r.q.ClaimNextPracticeSentence(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toPracticeSentence(row), nil
}

func (r *practiceSentenceRepository) CountQueued(ctx context.Context, userID uuid.UUID) (int, error) {
	n, err := r.q.CountQueuedPracticeSentences(ctx, userID)
	return int(n), err
}

func (r *practiceSentenceRepository) ListRecentTexts(ctx context.Context, userID uuid.UUID, limit int) ([]string, error) {
	texts, err := r.q.ListRecentPracticeSentenceTexts(ctx, sqlcgen.ListRecentPracticeSentenceTextsParams{
		UserID: userID,
		Limit:  int32(limit),
	})
	if err != nil {
		return nil, err
	}
	return texts, nil
}
