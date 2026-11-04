package handler

import (
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/i18n"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/service"
)

type ReviewHandler struct {
	svc   *service.ReviewService
	vocab *service.VocabService
}

func NewReviewHandler(svc *service.ReviewService, vocab *service.VocabService) *ReviewHandler {
	return &ReviewHandler{svc: svc, vocab: vocab}
}

func RegisterReviewRoutes(api *echo.Group, h *ReviewHandler, jwtAuth *middleware.JWTAuth) {
	r := api.Group("/review")
	r.GET("", h.Queue, jwtAuth.RequireAuth)
	r.POST("/words/:id/attempt", h.Attempt, jwtAuth.RequireAuth)
	r.POST("/words/:id/grade", h.Grade, jwtAuth.RequireAuth)
	r.DELETE("/words/:id", h.Remove, jwtAuth.RequireAuth)
	r.POST("/vocab", h.AddVocab, jwtAuth.RequireAuth)
	api.GET("/goals", h.Goals, jwtAuth.RequireAuth)
	api.PUT("/goals", h.SetGoals, jwtAuth.RequireAuth)
	api.PUT("/settings/lang", h.SetLang, jwtAuth.RequireAuth)
}

func reviewWordJSON(w *domain.ReviewWord) map[string]any {
	out := map[string]any{
		"id":           w.ID,
		"kind":         w.Kind,
		"word":         w.Word,
		"lastScore":    w.LastScore,
		"misses":       w.Misses,
		"intervalDays": w.IntervalDays,
		"reps":         w.Reps,
		"lapses":       w.Lapses,
		"dueAt":        w.DueAt,
		"vocab":        nil,
	}
	if w.Vocab != nil {
		out["vocab"] = vocabInfoJSON(*w.Vocab)
	}
	return out
}

func vocabInfoJSON(v domain.VocabInfo) map[string]any {
	return map[string]any{
		"pos": v.POS, "ipa": v.IPA, "meaning": v.Meaning,
		"exampleEn": v.ExampleEN, "exampleTranslation": v.ExampleTranslation, "band": v.Band,
	}
}

type gradeRequest struct {
	Quality int `json:"quality"` // 1 forgot, 3 hard, 4 good, 5 easy
}

// Grade schedules a vocab card from the learner's own rating.
func (h *ReviewHandler) Grade(c echo.Context) error {
	uid, id, err := h.wordID(c)
	if err != nil {
		return err
	}
	var req gradeRequest
	if err := c.Bind(&req); err != nil || req.Quality < 0 || req.Quality > 5 {
		return echo.NewHTTPError(http.StatusBadRequest, "quality must be 0-5")
	}
	w, err := h.svc.Grade(c.Request().Context(), uid, id, req.Quality, i18n.FromRequest(c))
	switch {
	case errors.Is(err, repository.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "word not found")
	case errors.Is(err, service.ErrNotVocabCard):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	case err != nil:
		log.Printf("review grade: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save the rating")
	}
	return c.JSON(http.StatusOK, reviewWordJSON(w))
}

func goalsJSON(g *service.Goals) map[string]any {
	return map[string]any{
		"measuredBand": g.MeasuredBand,
		"selfBand":     g.SelfBand,
		"targetBand":   g.TargetBand,
		"lang":         g.Lang,
		"currentBand":  g.CurrentBand,
		"bandFrom":     g.BandFrom,
		"bandTo":       g.BandTo,
		"remaining":    g.Remaining,
	}
}

// Goals returns the learner's bands and the band range of new words.
func (h *ReviewHandler) Goals(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	g, err := h.vocab.Goals(c.Request().Context(), uid)
	if err != nil {
		log.Printf("goals: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load goals")
	}
	return c.JSON(http.StatusOK, goalsJSON(g))
}

type goalsRequest struct {
	SelfBand   *float32 `json:"selfBand"`
	TargetBand *float32 `json:"targetBand"`
}

// SetGoals saves the self-estimated and target bands (null clears one).
func (h *ReviewHandler) SetGoals(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req goalsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	ctx := c.Request().Context()
	if err := h.vocab.SetGoals(ctx, uid, req.SelfBand, req.TargetBand); err != nil {
		if errors.Is(err, service.ErrInvalidBand) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save goals")
	}
	g, err := h.vocab.Goals(ctx, uid)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load goals")
	}
	return c.JSON(http.StatusOK, goalsJSON(g))
}

type addVocabRequest struct {
	Count int `json:"count"`
}

// AddVocab adds new words for the learner's band range as review cards.
func (h *ReviewHandler) AddVocab(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req addVocabRequest
	_ = c.Bind(&req)
	lang := i18n.FromRequest(c)
	words, err := h.vocab.AddNewWords(c.Request().Context(), uid, lang, req.Count)
	switch {
	case errors.Is(err, service.ErrNoWordsLeft):
		return echo.NewHTTPError(http.StatusConflict, i18n.T(lang, i18n.MsgNoWordsLeft))
	case errors.Is(err, service.ErrVocabUnenriched):
		return echo.NewHTTPError(http.StatusServiceUnavailable, i18n.T(lang, i18n.MsgVocabUnenriched))
	case err != nil:
		log.Printf("add vocab: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to add new words")
	}
	out := make([]map[string]any, 0, len(words))
	for _, w := range words {
		out = append(out, map[string]any{"word": w.Word, "band": w.Band, "vocab": vocabInfoJSON(w.Info)})
	}
	return c.JSON(http.StatusCreated, map[string]any{"added": out})
}

func reviewWordsJSON(ws []*domain.ReviewWord) []map[string]any {
	out := make([]map[string]any, 0, len(ws))
	for _, w := range ws {
		out = append(out, reviewWordJSON(w))
	}
	return out
}

// Queue returns the words due now (up to 20), the next ones and the counts.
func (h *ReviewHandler) Queue(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	ctx, lang := c.Request().Context(), i18n.FromRequest(c)
	// Cards added in another language get their meaning in this one first (one LLM call,
	// only after a language change).
	if err := h.vocab.TranslateCards(ctx, uid, lang, 20); err != nil {
		log.Printf("review queue: translate cards: %v", err)
	}
	q, err := h.svc.Queue(ctx, uid, lang)
	if err != nil {
		log.Printf("review queue: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load review words")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"due":      reviewWordsJSON(q.Due),
		"upcoming": reviewWordsJSON(q.Upcoming),
		"dueCount": q.DueCount,
		"total":    q.Total,
	})
}

func (h *ReviewHandler) wordID(c echo.Context) (uuid.UUID, uuid.UUID, error) {
	uid, err := requireUserID(c)
	if err != nil {
		return uuid.UUID{}, uuid.UUID{}, err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return uuid.UUID{}, uuid.UUID{}, echo.NewHTTPError(http.StatusBadRequest, "invalid word id")
	}
	return uid, id, nil
}

// Attempt scores one recording of the word (multipart "audio", WAV) and reschedules it.
func (h *ReviewHandler) Attempt(c echo.Context) error {
	uid, id, err := h.wordID(c)
	if err != nil {
		return err
	}
	fileHeader, err := c.FormFile("audio")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "missing audio file")
	}
	if fileHeader.Size > maxAudioUploadBytes {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "audio file too large")
	}
	file, err := fileHeader.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "cannot read audio file")
	}
	defer file.Close()
	audio, err := io.ReadAll(file)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to read audio file")
	}

	lang := i18n.FromRequest(c)
	res, err := h.svc.Review(c.Request().Context(), uid, id, audio, lang)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "word not found")
		}
		var noSpeech *service.NoSpeechError
		if errors.As(err, &noSpeech) {
			return echo.NewHTTPError(http.StatusUnprocessableEntity, i18n.T(lang, i18n.MsgNoSpeech))
		}
		log.Printf("review attempt: user=%s word=%s: %v", uid, id, err)
		return echo.NewHTTPError(http.StatusInternalServerError, i18n.T(lang, i18n.MsgScoringFailed))
	}
	phonemes := make([]map[string]any, 0, len(res.Phonemes))
	for _, p := range res.Phonemes {
		phonemes = append(phonemes, map[string]any{"phoneme": p.Phoneme, "score": p.Score})
	}
	return c.JSON(http.StatusOK, map[string]any{
		"word":     reviewWordJSON(res.Word),
		"score":    res.Score,
		"quality":  res.Quality,
		"passed":   res.Quality >= 3,
		"heard":    res.Heard,
		"phonemes": phonemes,
	})
}

// Remove takes a word off the review list.
func (h *ReviewHandler) Remove(c echo.Context) error {
	uid, id, err := h.wordID(c)
	if err != nil {
		return err
	}
	ok, err := h.svc.Remove(c.Request().Context(), uid, id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to remove word")
	}
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, "word not found")
	}
	return c.NoContent(http.StatusNoContent)
}

// SetLang saves the learner's language: {"lang": "<code>"} (internal/i18n).
func (h *ReviewHandler) SetLang(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req struct {
		Lang string `json:"lang"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := h.vocab.SetLang(c.Request().Context(), uid, req.Lang); err != nil {
		if errors.Is(err, service.ErrInvalidLang) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to save the setting")
	}
	return c.JSON(http.StatusOK, map[string]string{"lang": i18n.Normalize(req.Lang)})
}
