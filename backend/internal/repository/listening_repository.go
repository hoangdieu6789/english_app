package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

// ListeningRepository stores lessons, listening progress and dictation (db/queries/listening.sql).
type ListeningRepository interface {
	Create(ctx context.Context, l *domain.Lesson) error
	// Finish saves an AI lesson made in the background (ready or failed).
	Finish(ctx context.Context, l *domain.Lesson) error
	// Get returns ErrNotFound for a lesson that does not exist or is another learner's.
	Get(ctx context.Context, id, userID uuid.UUID) (*domain.Lesson, error)
	List(ctx context.Context, userID uuid.UUID, source string, limit int) ([]*domain.Lesson, error)
	// Delete returns the audio path of the deleted lesson, or ErrNotFound.
	Delete(ctx context.Context, id, userID uuid.UUID) (string, error)
	Pending(ctx context.Context) ([]*domain.Lesson, error)
	SaveProgress(ctx context.Context, userID, lessonID uuid.UUID, positionSec float32) error
	Progress(ctx context.Context, userID, lessonID uuid.UUID) (*domain.LessonProgress, error)
	AddDictation(ctx context.Context, userID, lessonID uuid.UUID, segment int, typed string, accuracy float32) error
	SaveDictationRun(ctx context.Context, userID, lessonID uuid.UUID, lines int, accuracy float32) error
}

type listeningRepository struct {
	q *sqlcgen.Queries
}

func NewListeningRepository(pool *pgxpool.Pool) ListeningRepository {
	return &listeningRepository{q: sqlcgen.New(pool)}
}

func pgUUID(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}

func fromPgUUID(id pgtype.UUID) *uuid.UUID {
	if !id.Valid {
		return nil
	}
	u := uuid.UUID(id.Bytes)
	return &u
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil || string(b) == "null" {
		return []byte("[]")
	}
	return b
}

func toDomainLesson(r sqlcgen.Lesson) *domain.Lesson {
	l := &domain.Lesson{
		ID: r.ID, OwnerID: fromPgUUID(r.OwnerID), Source: r.Source, Kind: r.Kind, Title: r.Title,
		Topic: r.Topic, Band: r.Band, AudioPath: r.AudioPath, AudioURL: r.AudioUrl, VideoURL: r.VideoUrl,
		DurationSec: r.DurationSec, SourceURL: r.SourceUrl, Credit: r.Credit, Status: r.Status,
		Error: r.Error, CreatedBy: fromPgUUID(r.CreatedBy), CreatedAt: r.CreatedAt.Time,
	}
	_ = json.Unmarshal(r.Segments, &l.Segments)
	_ = json.Unmarshal(r.Speakers, &l.Speakers)
	_ = json.Unmarshal(r.Phrases, &l.Phrases)
	l.Lines = len(l.Segments)
	return l
}

func (r *listeningRepository) Create(ctx context.Context, l *domain.Lesson) error {
	row, err := r.q.CreateLesson(ctx, sqlcgen.CreateLessonParams{
		OwnerID: pgUUID(l.OwnerID), Source: l.Source, Kind: l.Kind, Title: l.Title, Topic: l.Topic,
		Band: l.Band, Segments: mustJSON(l.Segments), Speakers: mustJSON(l.Speakers),
		AudioPath: l.AudioPath, AudioUrl: l.AudioURL, VideoUrl: l.VideoURL, DurationSec: l.DurationSec,
		SourceUrl: l.SourceURL, Credit: l.Credit, Status: l.Status, CreatedBy: pgUUID(l.CreatedBy),
	})
	if err != nil {
		return err
	}
	*l = *toDomainLesson(row)
	return nil
}

func (r *listeningRepository) Finish(ctx context.Context, l *domain.Lesson) error {
	return r.q.FinishLesson(ctx, sqlcgen.FinishLessonParams{
		ID: l.ID, Title: l.Title, Segments: mustJSON(l.Segments), Speakers: mustJSON(l.Speakers),
		Phrases: mustJSON(l.Phrases), AudioPath: l.AudioPath, DurationSec: l.DurationSec,
		Status: l.Status, Error: l.Error,
	})
}

func (r *listeningRepository) Get(ctx context.Context, id, userID uuid.UUID) (*domain.Lesson, error) {
	row, err := r.q.GetLesson(ctx, sqlcgen.GetLessonParams{ID: id, UserID: pgtype.UUID{Bytes: userID, Valid: true}})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return toDomainLesson(row), nil
}

func (r *listeningRepository) List(ctx context.Context, userID uuid.UUID, source string, limit int) ([]*domain.Lesson, error) {
	rows, err := r.q.ListLessons(ctx, sqlcgen.ListLessonsParams{UserID: userID, Source: source, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]*domain.Lesson, 0, len(rows))
	for _, x := range rows {
		l := &domain.Lesson{
			ID: x.ID, OwnerID: fromPgUUID(x.OwnerID), Source: x.Source, Kind: x.Kind, Title: x.Title,
			Topic: x.Topic, Band: x.Band, DurationSec: x.DurationSec, Status: x.Status, Error: x.Error,
			Credit: x.Credit, CreatedBy: fromPgUUID(x.CreatedBy), CreatedAt: x.CreatedAt.Time, Lines: int(x.Lines),
		}
		if x.ListenedAt.Valid || x.DictationBest.Valid || x.LinesDone.Valid {
			p := &domain.LessonProgress{LinesDone: int(x.LinesDone.Int32)}
			if x.ListenedAt.Valid {
				p.ListenedAt = &x.ListenedAt.Time
			}
			if x.DictationBest.Valid {
				p.DictationBest = &x.DictationBest.Float32
			}
			l.Progress = p
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *listeningRepository) Delete(ctx context.Context, id, userID uuid.UUID) (string, error) {
	path, err := r.q.DeleteLesson(ctx, sqlcgen.DeleteLessonParams{ID: id, UserID: pgtype.UUID{Bytes: userID, Valid: true}})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

func (r *listeningRepository) Pending(ctx context.Context) ([]*domain.Lesson, error) {
	rows, err := r.q.PendingLessons(ctx)
	out := make([]*domain.Lesson, 0, len(rows))
	for _, x := range rows {
		out = append(out, toDomainLesson(x))
	}
	return out, err
}

func (r *listeningRepository) SaveProgress(ctx context.Context, userID, lessonID uuid.UUID, positionSec float32) error {
	return r.q.SaveLessonProgress(ctx, sqlcgen.SaveLessonProgressParams{UserID: userID, LessonID: lessonID, PositionSec: positionSec})
}

func (r *listeningRepository) Progress(ctx context.Context, userID, lessonID uuid.UUID) (*domain.LessonProgress, error) {
	x, err := r.q.GetLessonProgress(ctx, sqlcgen.GetLessonProgressParams{UserID: userID, LessonID: lessonID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p := &domain.LessonProgress{PositionSec: x.PositionSec, LinesDone: int(x.LinesDone)}
	if x.ListenedAt.Valid {
		p.ListenedAt = &x.ListenedAt.Time
	}
	if x.DictationBest.Valid {
		p.DictationBest = &x.DictationBest.Float32
	}
	return p, nil
}

func (r *listeningRepository) AddDictation(ctx context.Context, userID, lessonID uuid.UUID, segment int, typed string, accuracy float32) error {
	return r.q.AddDictationAttempt(ctx, sqlcgen.AddDictationAttemptParams{UserID: userID, LessonID: lessonID, Segment: int32(segment), Typed: typed, Accuracy: accuracy})
}

func (r *listeningRepository) SaveDictationRun(ctx context.Context, userID, lessonID uuid.UUID, lines int, accuracy float32) error {
	return r.q.SaveDictationRun(ctx, sqlcgen.SaveDictationRunParams{UserID: userID, LessonID: lessonID, LinesDone: int32(lines), Accuracy: pgtype.Float4{Float32: accuracy, Valid: true}})
}

// NotebookRepository stores the word notebook (db/queries/notebook.sql).
type NotebookRepository interface {
	// SaveWord adds (or refreshes) a saved card with its details and returns its id.
	SaveWord(ctx context.Context, userID uuid.UUID, lang string, c *domain.NotebookCard) (uuid.UUID, error)
	List(ctx context.Context, userID uuid.UUID, lang string, limit int) ([]*domain.NotebookCard, error)
	// Entry returns the card's word and meaning, or ErrNotFound.
	Entry(ctx context.Context, id, userID uuid.UUID) (word, meaning string, err error)
	SetMyExample(ctx context.Context, id uuid.UUID, lang, sentence string, score float32) error
	AddSentence(ctx context.Context, userID uuid.UUID, s *domain.NotebookSentence) error
	Sentences(ctx context.Context, id, userID uuid.UUID) ([]*domain.NotebookSentence, error)
	// Sentence returns ErrNotFound for another learner's sentence.
	Sentence(ctx context.Context, id, userID uuid.UUID) (*domain.NotebookSentence, error)
	SetPronScore(ctx context.Context, id uuid.UUID, score float32) error
}

type notebookRepository struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewNotebookRepository(pool *pgxpool.Pool) NotebookRepository {
	return &notebookRepository{pool: pool, q: sqlcgen.New(pool)}
}

func (r *notebookRepository) SaveWord(ctx context.Context, userID uuid.UUID, lang string, c *domain.NotebookCard) (uuid.UUID, error) {
	var id uuid.UUID
	err := pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		q := r.q.WithTx(tx)
		var err error
		id, err = q.UpsertSavedWord(ctx, sqlcgen.UpsertSavedWordParams{UserID: userID, Word: c.Word})
		if err != nil {
			return err
		}
		return q.UpsertNotebookEntry(ctx, sqlcgen.UpsertNotebookEntryParams{
			ReviewWordID: id, Lang: lang, Pos: c.POS, Ipa: c.IPA, Meaning: c.Meaning, ExampleEn: c.ExampleEN,
			Context: c.Context, LessonID: pgUUID(c.LessonID), Band: c.Band,
		})
	})
	return id, err
}

func (r *notebookRepository) List(ctx context.Context, userID uuid.UUID, lang string, limit int) ([]*domain.NotebookCard, error) {
	rows, err := r.q.ListNotebook(ctx, sqlcgen.ListNotebookParams{UserID: userID, Lang: lang, MaxRows: int32(limit)})
	if err != nil {
		return nil, err
	}
	out := make([]*domain.NotebookCard, 0, len(rows))
	for _, x := range rows {
		c := &domain.NotebookCard{
			ID: x.ID, Word: x.Word, Kind: x.Kind, POS: x.Pos, IPA: x.Ipa, Meaning: x.Meaning,
			ExampleEN: x.ExampleEn, ExampleMine: x.ExampleMine, Context: x.Context,
			LessonID: fromPgUUID(x.LessonID), LessonTitle: x.LessonTitle, Band: x.Band, Misses: int(x.Misses),
			LastScore: x.LastScore, IntervalDays: int(x.IntervalDays), Reps: int(x.Reps),
			DueAt: x.DueAt.Time, CreatedAt: x.CreatedAt.Time,
		}
		if x.ExampleScore.Valid {
			c.ExampleScore = &x.ExampleScore.Float32
		}
		out = append(out, c)
	}
	return out, nil
}

func (r *notebookRepository) Entry(ctx context.Context, id, userID uuid.UUID) (string, string, error) {
	row, err := r.q.GetNotebookEntry(ctx, sqlcgen.GetNotebookEntryParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrNotFound
	}
	return row.Word, row.Meaning, err
}

func (r *notebookRepository) SetMyExample(ctx context.Context, id uuid.UUID, lang, sentence string, score float32) error {
	return r.q.SetMyExample(ctx, sqlcgen.SetMyExampleParams{ReviewWordID: id, Lang: lang, ExampleEn: sentence, Score: pgtype.Float4{Float32: score, Valid: true}})
}

func toDomainSentence(x sqlcgen.NotebookSentence) *domain.NotebookSentence {
	s := &domain.NotebookSentence{ID: x.ID, ReviewWordID: x.ReviewWordID, Text: x.Text, Score: x.Score, Accepted: x.Accepted, CreatedAt: x.CreatedAt.Time}
	_ = json.Unmarshal(x.Verdict, &s.Verdict)
	if x.PronScore.Valid {
		s.PronScore = &x.PronScore.Float32
	}
	return s
}

func (r *notebookRepository) AddSentence(ctx context.Context, userID uuid.UUID, s *domain.NotebookSentence) error {
	v, _ := json.Marshal(s.Verdict)
	row, err := r.q.AddNotebookSentence(ctx, sqlcgen.AddNotebookSentenceParams{
		ReviewWordID: s.ReviewWordID, UserID: userID, Text: s.Text, Score: s.Score, Verdict: v, Accepted: s.Accepted,
	})
	if err != nil {
		return err
	}
	*s = *toDomainSentence(row)
	return nil
}

func (r *notebookRepository) Sentences(ctx context.Context, id, userID uuid.UUID) ([]*domain.NotebookSentence, error) {
	rows, err := r.q.ListNotebookSentences(ctx, sqlcgen.ListNotebookSentencesParams{ReviewWordID: id, UserID: userID})
	out := make([]*domain.NotebookSentence, 0, len(rows))
	for _, x := range rows {
		out = append(out, toDomainSentence(x))
	}
	return out, err
}

func (r *notebookRepository) Sentence(ctx context.Context, id, userID uuid.UUID) (*domain.NotebookSentence, error) {
	x, err := r.q.GetNotebookSentence(ctx, sqlcgen.GetNotebookSentenceParams{ID: id, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return toDomainSentence(x), nil
}

func (r *notebookRepository) SetPronScore(ctx context.Context, id uuid.UUID, score float32) error {
	return r.q.SetSentencePronScore(ctx, sqlcgen.SetSentencePronScoreParams{ID: id, PronScore: pgtype.Float4{Float32: score, Valid: true}})
}
