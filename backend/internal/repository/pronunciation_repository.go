package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

type PronunciationRepository interface {
	Create(ctx context.Context, attempt *domain.PronunciationAttempt) (*domain.PronunciationAttempt, error)
}

type pronunciationRepository struct {
	q *sqlcgen.Queries
}

func NewPronunciationRepository(pool *pgxpool.Pool) PronunciationRepository {
	return &pronunciationRepository{q: sqlcgen.New(pool)}
}

func (r *pronunciationRepository) Create(ctx context.Context, attempt *domain.PronunciationAttempt) (*domain.PronunciationAttempt, error) {
	wordScoresJSON, err := json.Marshal(attempt.WordScores)
	if err != nil {
		return nil, fmt.Errorf("marshal word scores: %w", err)
	}
	phonemeScoresJSON, err := json.Marshal(attempt.PhonemeScores)
	if err != nil {
		return nil, fmt.Errorf("marshal phoneme scores: %w", err)
	}

	var recognizedText pgtype.Text
	if attempt.RecognizedText != nil {
		recognizedText = pgtype.Text{String: *attempt.RecognizedText, Valid: true}
	}

	row, err := r.q.CreatePronunciationAttempt(ctx, sqlcgen.CreatePronunciationAttemptParams{
		UserID:         attempt.UserID,
		AudioUrl:       attempt.AudioURL,
		ReferenceText:  attempt.ReferenceText,
		RecognizedText: recognizedText,
		OverallScore:   attempt.OverallScore,
		FluencyScore:   attempt.FluencyScore,
		WordScores:     wordScoresJSON,
		PhonemeScores:  phonemeScoresJSON,
	})
	if err != nil {
		return nil, err
	}

	return toDomainPronunciationAttempt(row)
}

func toDomainPronunciationAttempt(row sqlcgen.PronunciationAttempt) (*domain.PronunciationAttempt, error) {
	var wordScores []domain.WordScore
	if err := json.Unmarshal(row.WordScores, &wordScores); err != nil {
		return nil, fmt.Errorf("unmarshal word scores: %w", err)
	}
	var phonemeScores []domain.PhonemeScore
	if err := json.Unmarshal(row.PhonemeScores, &phonemeScores); err != nil {
		return nil, fmt.Errorf("unmarshal phoneme scores: %w", err)
	}

	attempt := &domain.PronunciationAttempt{
		ID:            row.ID,
		UserID:        row.UserID,
		AudioURL:      row.AudioUrl,
		ReferenceText: row.ReferenceText,
		OverallScore:  row.OverallScore,
		FluencyScore:  row.FluencyScore,
		WordScores:    wordScores,
		PhonemeScores: phonemeScores,
		CreatedAt:     row.CreatedAt.Time,
	}
	if row.RecognizedText.Valid {
		attempt.RecognizedText = &row.RecognizedText.String
	}
	return attempt, nil
}
