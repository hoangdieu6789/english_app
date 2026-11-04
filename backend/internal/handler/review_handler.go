package handler

import (
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/service"
)

type ReviewHandler struct {
	svc *service.ReviewService
}

func NewReviewHandler(svc *service.ReviewService) *ReviewHandler {
	return &ReviewHandler{svc: svc}
}

func RegisterReviewRoutes(api *echo.Group, h *ReviewHandler, jwtAuth *middleware.JWTAuth) {
	r := api.Group("/review")
	r.GET("", h.Queue, jwtAuth.RequireAuth)
	r.POST("/words/:id/attempt", h.Attempt, jwtAuth.RequireAuth)
	r.DELETE("/words/:id", h.Remove, jwtAuth.RequireAuth)
}

func reviewWordJSON(w *domain.ReviewWord) map[string]any {
	return map[string]any{
		"id":           w.ID,
		"word":         w.Word,
		"lastScore":    w.LastScore,
		"intervalDays": w.IntervalDays,
		"reps":         w.Reps,
		"lapses":       w.Lapses,
		"dueAt":        w.DueAt,
	}
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
	q, err := h.svc.Queue(c.Request().Context(), uid)
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

	res, err := h.svc.Review(c.Request().Context(), uid, id, audio)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "word not found")
		}
		var noSpeech *service.NoSpeechError
		if errors.As(err, &noSpeech) {
			return echo.NewHTTPError(http.StatusUnprocessableEntity,
				"Không nhận ra lời nói trong bản ghi. Kiểm tra micro, nói to và rõ hơn rồi thử lại.")
		}
		log.Printf("review attempt: user=%s word=%s: %v", uid, id, err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Chấm điểm thất bại. Thử lại sau ít phút.")
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
