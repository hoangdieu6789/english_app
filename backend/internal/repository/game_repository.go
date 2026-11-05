package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

// GameRepository stores game plays and reads game decks (db/queries/games.sql).
type GameRepository interface {
	DeckMine(ctx context.Context, userID uuid.UUID, lang string, limit int) ([]*domain.GameCard, error)
	DeckBand(ctx context.Context, lang string, from, to float32, limit int) ([]*domain.GameCard, error)
	CountReady(ctx context.Context, lang string, from, to float32) (int, error)
	UnenrichedInBand(ctx context.Context, lang string, from, to float32, limit int) ([]*domain.VocabWord, error)
	WordsByID(ctx context.Context, lang string, ids []uuid.UUID) ([]*domain.GameCard, error)
	UnenrichedByID(ctx context.Context, lang string, ids []uuid.UUID) ([]*domain.VocabWord, error)
	// VocabOrder returns every headword's id and band in level order.
	VocabOrder(ctx context.Context) ([]uuid.UUID, []float32, error)
	SavePlay(ctx context.Context, p *domain.GamePlay) error
	Bests(ctx context.Context, userID uuid.UUID) ([]domain.GameBest, error)
	VocabLevel(ctx context.Context, userID uuid.UUID) (int, error) // 0 = not set
	LangsInUse(ctx context.Context) ([]string, error)
	NextUnenriched(ctx context.Context, lang string, skip []uuid.UUID, limit int) ([]*domain.VocabWord, error)
}

type gameRepository struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewGameRepository(pool *pgxpool.Pool) GameRepository {
	return &gameRepository{pool: pool, q: sqlcgen.New(pool)}
}

func gameCard(id uuid.UUID, word string, band float32, pos, ipa, ex pgtype.Text, meaning, exTr string) *domain.GameCard {
	return &domain.GameCard{
		ID: id, Word: word, Band: band, POS: pos.String, IPA: ipa.String, ExampleEN: ex.String,
		Meaning: meaning, ExampleTranslation: exTr,
	}
}

func (r *gameRepository) DeckMine(ctx context.Context, userID uuid.UUID, lang string, limit int) ([]*domain.GameCard, error) {
	rows, err := r.q.GameDeckMine(ctx, sqlcgen.GameDeckMineParams{UserID: userID, Lang: lang, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	seen := map[uuid.UUID]bool{} // a word can be both a vocab and a pronunciation card
	out := make([]*domain.GameCard, 0, len(rows))
	for _, w := range rows {
		if seen[w.ID] {
			continue
		}
		seen[w.ID] = true
		c := gameCard(w.ID, w.Word, w.Band, w.Pos, w.Ipa, w.ExampleEn, w.Meaning, w.ExampleTranslation)
		c.Missed = w.Missed
		out = append(out, c)
	}
	return out, nil
}

func (r *gameRepository) DeckBand(ctx context.Context, lang string, from, to float32, limit int) ([]*domain.GameCard, error) {
	rows, err := r.q.GameDeckBand(ctx, sqlcgen.GameDeckBandParams{Lang: lang, BandFrom: from, BandTo: to, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]*domain.GameCard, 0, len(rows))
	for _, w := range rows {
		out = append(out, gameCard(w.ID, w.Word, w.Band, w.Pos, w.Ipa, w.ExampleEn, w.Meaning, w.ExampleTranslation))
	}
	return out, nil
}

func (r *gameRepository) CountReady(ctx context.Context, lang string, from, to float32) (int, error) {
	n, err := r.q.GameCountReady(ctx, sqlcgen.GameCountReadyParams{Lang: lang, BandFrom: from, BandTo: to})
	return int(n), err
}

func vocabWords(rows []sqlcgen.VocabWord) []*domain.VocabWord {
	out := make([]*domain.VocabWord, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomainVocabWord(row))
	}
	return out
}

func (r *gameRepository) UnenrichedInBand(ctx context.Context, lang string, from, to float32, limit int) ([]*domain.VocabWord, error) {
	rows, err := r.q.GameUnenrichedInBand(ctx, sqlcgen.GameUnenrichedInBandParams{Lang: lang, BandFrom: from, BandTo: to, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	return vocabWords(rows), nil
}

func (r *gameRepository) WordsByID(ctx context.Context, lang string, ids []uuid.UUID) ([]*domain.GameCard, error) {
	rows, err := r.q.GameWordsByID(ctx, sqlcgen.GameWordsByIDParams{Lang: lang, Ids: ids})
	if err != nil {
		return nil, err
	}
	out := make([]*domain.GameCard, 0, len(rows))
	for _, w := range rows {
		out = append(out, gameCard(w.ID, w.Word, w.Band, w.Pos, w.Ipa, w.ExampleEn, w.Meaning, w.ExampleTranslation))
	}
	return out, nil
}

func (r *gameRepository) UnenrichedByID(ctx context.Context, lang string, ids []uuid.UUID) ([]*domain.VocabWord, error) {
	rows, err := r.q.GameUnenrichedByID(ctx, sqlcgen.GameUnenrichedByIDParams{Lang: lang, Ids: ids})
	if err != nil {
		return nil, err
	}
	return vocabWords(rows), nil
}

func (r *gameRepository) VocabOrder(ctx context.Context) ([]uuid.UUID, []float32, error) {
	rows, err := r.q.GameVocabOrder(ctx)
	if err != nil {
		return nil, nil, err
	}
	ids, bands := make([]uuid.UUID, len(rows)), make([]float32, len(rows))
	for i, row := range rows {
		ids[i], bands[i] = row.ID, row.Band
	}
	return ids, bands, nil
}

// SavePlay saves the play, the per-word stats, makes the review cards answered wrongly due
// now and saves the Level Climb level, in one transaction.
func (r *gameRepository) SavePlay(ctx context.Context, p *domain.GamePlay) error {
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		q := r.q.WithTx(tx)
		level := pgtype.Int2{Int16: int16(p.Level), Valid: p.Level > 0}
		if err := q.InsertGamePlay(ctx, sqlcgen.InsertGamePlayParams{
			UserID: p.UserID, Game: p.Game, Deck: p.Deck, Score: int32(p.Score), Correct: int32(p.Correct),
			Total: int32(p.Total), DurationMs: int32(p.DurationMS), Level: level,
		}); err != nil {
			return fmt.Errorf("insert play: %w", err)
		}
		var wrong []uuid.UUID
		for _, a := range p.Answers {
			correct := int32(0)
			if a.Correct {
				correct = 1
			} else {
				wrong = append(wrong, a.WordID)
			}
			if err := q.UpsertGameWordStat(ctx, sqlcgen.UpsertGameWordStatParams{UserID: p.UserID, VocabWordID: a.WordID, Correct: correct}); err != nil {
				return fmt.Errorf("word stat: %w", err)
			}
		}
		if len(wrong) > 0 {
			if err := q.MakeReviewCardsDue(ctx, sqlcgen.MakeReviewCardsDueParams{UserID: p.UserID, Ids: wrong}); err != nil {
				return fmt.Errorf("review due: %w", err)
			}
		}
		if p.Level > 0 {
			if err := q.SetVocabLevel(ctx, sqlcgen.SetVocabLevelParams{ID: p.UserID, VocabLevel: level}); err != nil {
				return fmt.Errorf("set level: %w", err)
			}
		}
		return nil
	})
}

func (r *gameRepository) Bests(ctx context.Context, userID uuid.UUID) ([]domain.GameBest, error) {
	rows, err := r.q.GameBests(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.GameBest, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.GameBest{Game: row.Game, Best: int(row.Best), Plays: int(row.Plays), LastPlayed: row.LastPlayed.Time})
	}
	return out, nil
}

func (r *gameRepository) VocabLevel(ctx context.Context, userID uuid.UUID) (int, error) {
	l, err := r.q.GetVocabLevel(ctx, userID)
	if err != nil {
		return 0, err
	}
	return int(l.Int16), nil
}

func (r *gameRepository) LangsInUse(ctx context.Context) ([]string, error) {
	return r.q.GameLangsInUse(ctx)
}

func (r *gameRepository) NextUnenriched(ctx context.Context, lang string, skip []uuid.UUID, limit int) ([]*domain.VocabWord, error) {
	if skip == nil {
		skip = []uuid.UUID{}
	}
	rows, err := r.q.GameNextUnenriched(ctx, sqlcgen.GameNextUnenrichedParams{Lang: lang, Skip: skip, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	return vocabWords(rows), nil
}
