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
	taskType := attempt.TaskType
	if taskType == "" {
		taskType = "shadowing"
	}

	row, err := r.q.CreatePronunciationAttempt(ctx, sqlcgen.CreatePronunciationAttemptParams{
		UserID:            attempt.UserID,
		AudioUrl:          attempt.AudioURL,
		ReferenceText:     attempt.ReferenceText,
		RecognizedText:    recognizedText,
		OverallScore:      attempt.OverallScore,
		FluencyScore:      attempt.FluencyScore,
		WordScores:        wordScoresJSON,
		PhonemeScores:     phonemeScoresJSON,
		TaskType:          taskType,
		CompletenessScore: toFloat4(attempt.CompletenessScore),
		ProsodyScore:      toFloat4(attempt.ProsodyScore),
		PronScore:         toFloat4(attempt.PronScore),
		AzureResult:       nilIfEmpty(attempt.AzureResult),
		Rubric:            nilIfEmpty(attempt.Rubric),
		RubricScore:       toFloat4(attempt.RubricScore),
		CefrLevel:         toText(attempt.CEFRLevel),
		RubricVersion:     toText(attempt.RubricVersion),
		QuestionSetID:     toUUID(attempt.QuestionSetID),
		TaskPrompt:        toText(attempt.TaskPrompt),
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
		ID:                row.ID,
		UserID:            row.UserID,
		AudioURL:          row.AudioUrl,
		ReferenceText:     row.ReferenceText,
		TaskType:          row.TaskType,
		OverallScore:      row.OverallScore,
		FluencyScore:      row.FluencyScore,
		CompletenessScore: fromFloat4(row.CompletenessScore),
		ProsodyScore:      fromFloat4(row.ProsodyScore),
		PronScore:         fromFloat4(row.PronScore),
		WordScores:        wordScores,
		PhonemeScores:     phonemeScores,
		AzureResult:       row.AzureResult,
		Rubric:            row.Rubric,
		RubricScore:       fromFloat4(row.RubricScore),
		CEFRLevel:         fromText(row.CefrLevel),
		RubricVersion:     fromText(row.RubricVersion),
		QuestionSetID:     fromUUID(row.QuestionSetID),
		TaskPrompt:        fromText(row.TaskPrompt),
		CreatedAt:         row.CreatedAt.Time,
	}
	if row.RecognizedText.Valid {
		attempt.RecognizedText = &row.RecognizedText.String
	}
	return attempt, nil
}

func toFloat4(v *float32) pgtype.Float4 {
	if v == nil {
		return pgtype.Float4{}
	}
	return pgtype.Float4{Float32: *v, Valid: true}
}

func fromFloat4(v pgtype.Float4) *float32 {
	if !v.Valid {
		return nil
	}
	f := v.Float32
	return &f
}

func toText(v *string) pgtype.Text {
	if v == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *v, Valid: true}
}

func fromText(v pgtype.Text) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

// nilIfEmpty stores SQL NULL instead of an empty JSONB value.
func nilIfEmpty(b []byte) []byte {
	if len(b) == 0 {
		return nil
	}
	return b
}
