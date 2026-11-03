package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

// QuestionSetRepository stores the shared IELTS question sets and reads each learner's
// progress from their attempts (pronunciation_attempts.question_set_id).
type QuestionSetRepository interface {
	// Insert adds a set; it returns false when a set with the same kind and topic exists.
	Insert(ctx context.Context, set domain.QuestionSet) (bool, error)
	// Get returns nil when the set does not exist.
	Get(ctx context.Context, id uuid.UUID) (*domain.QuestionSet, error)
	// PickUnseen returns a random set the user has not answered for taskType; nil when none.
	PickUnseen(ctx context.Context, userID uuid.UUID, kind, taskType string, exclude *uuid.UUID) (*domain.QuestionSet, error)
	// PickOldestDone returns the done set answered longest ago; nil when none.
	PickOldestDone(ctx context.Context, userID uuid.UUID, kind, taskType string, exclude *uuid.UUID) (*domain.QuestionSet, error)
	CountUnseen(ctx context.Context, userID uuid.UUID, kind, taskType string) (int, error)
	ListWithProgress(ctx context.Context, userID uuid.UUID, kind, taskType string) ([]domain.QuestionSetProgress, error)
	ListTopics(ctx context.Context, kind string) ([]string, error)
}

type questionSetRepository struct {
	q *sqlcgen.Queries
}

func NewQuestionSetRepository(pool *pgxpool.Pool) QuestionSetRepository {
	return &questionSetRepository{q: sqlcgen.New(pool)}
}

func (r *questionSetRepository) Insert(ctx context.Context, set domain.QuestionSet) (bool, error) {
	points, err := json.Marshal(nonNil(set.Points))
	if err != nil {
		return false, fmt.Errorf("marshal points: %w", err)
	}
	questions, err := json.Marshal(nonNil(set.Questions))
	if err != nil {
		return false, fmt.Errorf("marshal questions: %w", err)
	}
	source := set.Source
	if source == "" {
		source = "seed"
	}
	n, err := r.q.InsertQuestionSet(ctx, sqlcgen.InsertQuestionSetParams{
		Kind:      set.Kind,
		Topic:     set.Topic,
		Prompt:    set.Prompt,
		Points:    points,
		Questions: questions,
		Source:    source,
	})
	return n > 0, err
}

func (r *questionSetRepository) Get(ctx context.Context, id uuid.UUID) (*domain.QuestionSet, error) {
	return oneSet(r.q.GetQuestionSet(ctx, id))
}

func (r *questionSetRepository) PickUnseen(ctx context.Context, userID uuid.UUID, kind, taskType string, exclude *uuid.UUID) (*domain.QuestionSet, error) {
	return oneSet(r.q.PickUnseenQuestionSet(ctx, sqlcgen.PickUnseenQuestionSetParams{
		Kind: kind, ExcludeID: toUUID(exclude), UserID: userID, TaskType: taskType,
	}))
}

func (r *questionSetRepository) PickOldestDone(ctx context.Context, userID uuid.UUID, kind, taskType string, exclude *uuid.UUID) (*domain.QuestionSet, error) {
	return oneSet(r.q.PickOldestDoneQuestionSet(ctx, sqlcgen.PickOldestDoneQuestionSetParams{
		Kind: kind, ExcludeID: toUUID(exclude), UserID: userID, TaskType: taskType,
	}))
}

func (r *questionSetRepository) CountUnseen(ctx context.Context, userID uuid.UUID, kind, taskType string) (int, error) {
	n, err := r.q.CountUnseenQuestionSets(ctx, sqlcgen.CountUnseenQuestionSetsParams{
		Kind: kind, UserID: userID, TaskType: taskType,
	})
	return int(n), err
}

func (r *questionSetRepository) ListWithProgress(ctx context.Context, userID uuid.UUID, kind, taskType string) ([]domain.QuestionSetProgress, error) {
	rows, err := r.q.ListQuestionSetsWithProgress(ctx, sqlcgen.ListQuestionSetsWithProgressParams{
		UserID: userID, TaskType: taskType, Kind: kind,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.QuestionSetProgress, 0, len(rows))
	for _, row := range rows {
		set, err := toQuestionSet(sqlcgen.IeltsQuestionSet{
			ID: row.ID, Kind: row.Kind, Topic: row.Topic, Prompt: row.Prompt,
			Points: row.Points, Questions: row.Questions, Source: row.Source,
		})
		if err != nil {
			return nil, err
		}
		p := domain.QuestionSetProgress{QuestionSet: *set, AttemptCount: int(row.AttemptCount)}
		if row.LastAttemptAt.Valid {
			t := row.LastAttemptAt.Time
			p.LastAttemptAt = &t
		}
		if row.BestBand > 0 {
			b := row.BestBand
			p.BestBand = &b
		}
		out = append(out, p)
	}
	return out, nil
}

func (r *questionSetRepository) ListTopics(ctx context.Context, kind string) ([]string, error) {
	return r.q.ListQuestionSetTopics(ctx, kind)
}

func oneSet(row sqlcgen.IeltsQuestionSet, err error) (*domain.QuestionSet, error) {
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toQuestionSet(row)
}

func toQuestionSet(row sqlcgen.IeltsQuestionSet) (*domain.QuestionSet, error) {
	set := &domain.QuestionSet{
		ID: row.ID, Kind: row.Kind, Topic: row.Topic, Prompt: row.Prompt,
		Source: row.Source, CreatedAt: row.CreatedAt.Time,
		Points: []string{}, Questions: []string{},
	}
	if err := json.Unmarshal(row.Points, &set.Points); err != nil {
		return nil, fmt.Errorf("unmarshal points: %w", err)
	}
	if err := json.Unmarshal(row.Questions, &set.Questions); err != nil {
		return nil, fmt.Errorf("unmarshal questions: %w", err)
	}
	return set, nil
}

func toUUID(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}

func fromUUID(id pgtype.UUID) *uuid.UUID {
	if !id.Valid {
		return nil
	}
	u := uuid.UUID(id.Bytes)
	return &u
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
