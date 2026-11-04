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
	"englishapp/backend/internal/vocab"
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
	// ListPronunciationWords returns every learner's pronunciation words (id -> word).
	ListPronunciationWords(ctx context.Context) (map[uuid.UUID]string, error)
	DeleteByIDs(ctx context.Context, ids []uuid.UUID) error
}

// VocabRepository holds the NGSL/NAWL words, learners' goals and vocab cards.
type VocabRepository interface {
	Seed(ctx context.Context, words []vocab.Word) error
	// PickNew returns up to limit words with band in (from, to] the learner has no card for
	// and that are not in known, easiest band and most frequent first.
	PickNew(ctx context.Context, userID uuid.UUID, from, to float32, known []string, limit int) ([]*domain.VocabWord, error)
	CountNew(ctx context.Context, userID uuid.UUID, from, to float32, known []string) (int, error)
	SaveEnrichment(ctx context.Context, w *domain.VocabWord) error
	AddCard(ctx context.Context, userID uuid.UUID, w *domain.VocabWord) error
	// SpokenWords returns the words the learner said well in their own free speech.
	SpokenWords(ctx context.Context, userID uuid.UUID) ([]string, error)
	// MeasuredBand is the 90-day average IELTS band; 0 when none.
	MeasuredBand(ctx context.Context, userID uuid.UUID) (float32, error)
}

type reviewRepository struct {
	q *sqlcgen.Queries
}

func NewReviewRepository(pool *pgxpool.Pool) ReviewRepository {
	return &reviewRepository{q: sqlcgen.New(pool)}
}

func NewVocabRepository(pool *pgxpool.Pool) VocabRepository {
	return &reviewRepository{q: sqlcgen.New(pool)}
}

func (r *reviewRepository) Upsert(ctx context.Context, userID uuid.UUID, word string, score float32) error {
	return r.q.UpsertReviewWord(ctx, sqlcgen.UpsertReviewWordParams{UserID: userID, Word: word, LastScore: score})
}

func (r *reviewRepository) ListDue(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error) {
	rows, err := r.q.ListDueReviewWords(ctx, sqlcgen.ListDueReviewWordsParams{UserID: userID, Limit: int32(limit)})
	out := make([]*domain.ReviewWord, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainReviewWord(row))
	}
	return out, err
}

func (r *reviewRepository) ListUpcoming(ctx context.Context, userID uuid.UUID, limit int) ([]*domain.ReviewWord, error) {
	rows, err := r.q.ListUpcomingReviewWords(ctx, sqlcgen.ListUpcomingReviewWordsParams{UserID: userID, Limit: int32(limit)})
	out := make([]*domain.ReviewWord, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainReviewWord(sqlcgen.ListDueReviewWordsRow(row)))
	}
	return out, err
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
	return toDomainReviewWord(sqlcgen.ListDueReviewWordsRow(row)), nil
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

func (r *reviewRepository) ListPronunciationWords(ctx context.Context) (map[uuid.UUID]string, error) {
	rows, err := r.q.ListPronunciationReviewWords(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]string, len(rows))
	for _, row := range rows {
		out[row.ID] = row.Word
	}
	return out, nil
}

func (r *reviewRepository) DeleteByIDs(ctx context.Context, ids []uuid.UUID) error {
	return r.q.DeleteReviewWordsByID(ctx, ids)
}

func (r *reviewRepository) Seed(ctx context.Context, words []vocab.Word) error {
	p := sqlcgen.SeedVocabWordsParams{}
	for _, w := range words {
		p.Words = append(p.Words, w.Word)
		p.Sources = append(p.Sources, w.Source)
		p.Ranks = append(p.Ranks, int32(w.Rank))
		p.Bands = append(p.Bands, w.Band)
	}
	return r.q.SeedVocabWords(ctx, p)
}

func (r *reviewRepository) PickNew(ctx context.Context, userID uuid.UUID, from, to float32, known []string, limit int) ([]*domain.VocabWord, error) {
	rows, err := r.q.PickNewVocabWords(ctx, sqlcgen.PickNewVocabWordsParams{
		BandFrom: from, BandTo: to, Known: nonNil(known), UserID: userID, MaxRows: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]*domain.VocabWord, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainVocabWord(row))
	}
	return out, nil
}

func (r *reviewRepository) CountNew(ctx context.Context, userID uuid.UUID, from, to float32, known []string) (int, error) {
	n, err := r.q.CountNewVocabWords(ctx, sqlcgen.CountNewVocabWordsParams{BandFrom: from, BandTo: to, Known: nonNil(known), UserID: userID})
	return int(n), err
}

func (r *reviewRepository) SaveEnrichment(ctx context.Context, w *domain.VocabWord) error {
	return r.q.UpdateVocabEnrichment(ctx, sqlcgen.UpdateVocabEnrichmentParams{
		ID:        w.ID,
		Pos:       text(w.Info.POS),
		Ipa:       text(w.Info.IPA),
		MeaningVi: text(w.Info.MeaningVI),
		ExampleEn: text(w.Info.ExampleEN),
		ExampleVi: text(w.Info.ExampleVI),
	})
}

func (r *reviewRepository) AddCard(ctx context.Context, userID uuid.UUID, w *domain.VocabWord) error {
	return r.q.AddVocabReviewWord(ctx, sqlcgen.AddVocabReviewWordParams{
		UserID: userID, Word: w.Word, VocabWordID: pgtype.UUID{Bytes: w.ID, Valid: true},
	})
}

func (r *reviewRepository) SpokenWords(ctx context.Context, userID uuid.UUID) ([]string, error) {
	return r.q.ListUserSpokenWords(ctx, userID)
}

func (r *reviewRepository) MeasuredBand(ctx context.Context, userID uuid.UUID) (float32, error) {
	return r.q.MeasuredBand(ctx, userID)
}

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }

func toDomainVocabWord(row sqlcgen.VocabWord) *domain.VocabWord {
	return &domain.VocabWord{
		ID:     row.ID,
		Word:   row.Word,
		Source: row.Source,
		Rank:   int(row.Rank),
		Band:   row.Band,
		Info: domain.VocabInfo{
			POS: row.Pos.String, IPA: row.Ipa.String, MeaningVI: row.MeaningVi.String,
			ExampleEN: row.ExampleEn.String, ExampleVI: row.ExampleVi.String, Band: row.Band,
		},
		Enriched: row.EnrichedAt.Valid && row.MeaningVi.Valid,
	}
}

func toDomainReviewWord(row sqlcgen.ListDueReviewWordsRow) *domain.ReviewWord {
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
		Kind:         row.Kind,
		Misses:       int(row.Misses),
		MinScore:     row.MinScore,
	}
	if row.LastReviewedAt.Valid {
		w.LastReviewedAt = &row.LastReviewedAt.Time
	}
	if row.Kind == domain.ReviewVocab {
		w.Vocab = &domain.VocabInfo{
			POS: row.Pos.String, IPA: row.Ipa.String, MeaningVI: row.MeaningVi.String,
			ExampleEN: row.ExampleEn.String, ExampleVI: row.ExampleVi.String, Band: row.Band.Float32,
		}
	}
	return w
}
