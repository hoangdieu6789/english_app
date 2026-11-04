package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/repository/sqlcgen"
)

// CoachRepository stores model answers (shared) and improved answers (per attempt).
type CoachRepository interface {
	// GetSample returns nil when there is no cached model answer.
	GetSample(ctx context.Context, questionHash string, band float32, lang string) (json.RawMessage, error)
	SaveSample(ctx context.Context, questionHash, taskType, question string, band float32, lang string, content json.RawMessage) error
	SaveImproved(ctx context.Context, attemptID, userID uuid.UUID, content json.RawMessage) error
}

type coachRepository struct {
	q *sqlcgen.Queries
}

func NewCoachRepository(pool *pgxpool.Pool) CoachRepository {
	return &coachRepository{q: sqlcgen.New(pool)}
}

func (r *coachRepository) GetSample(ctx context.Context, questionHash string, band float32, lang string) (json.RawMessage, error) {
	c, err := r.q.GetSampleAnswer(ctx, sqlcgen.GetSampleAnswerParams{QuestionHash: questionHash, Band: band, Lang: lang})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

func (r *coachRepository) SaveSample(ctx context.Context, questionHash, taskType, question string, band float32, lang string, content json.RawMessage) error {
	return r.q.SaveSampleAnswer(ctx, sqlcgen.SaveSampleAnswerParams{
		QuestionHash: questionHash, TaskType: taskType, Question: question, Band: band, Lang: lang, Content: content,
	})
}

func (r *coachRepository) SaveImproved(ctx context.Context, attemptID, userID uuid.UUID, content json.RawMessage) error {
	return r.q.SaveImprovedAnswer(ctx, sqlcgen.SaveImprovedAnswerParams{ID: attemptID, UserID: userID, ImprovedAnswer: content})
}
