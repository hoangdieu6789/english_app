package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

type PracticeSentenceRepository interface {
	Create(ctx context.Context, userID uuid.UUID, text, phonetic, gloss string) (*domain.PracticeSentence, error)
	ListRecentTexts(ctx context.Context, userID uuid.UUID, limit int) ([]string, error)
}

type practiceSentenceRepository struct {
	q *sqlcgen.Queries
}

func NewPracticeSentenceRepository(pool *pgxpool.Pool) PracticeSentenceRepository {
	return &practiceSentenceRepository{q: sqlcgen.New(pool)}
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

	return &domain.PracticeSentence{
		ID:        row.ID,
		UserID:    row.UserID,
		Text:      row.Text,
		Phonetic:  row.Phonetic,
		Gloss:     row.Gloss,
		CreatedAt: row.CreatedAt.Time,
	}, nil
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
