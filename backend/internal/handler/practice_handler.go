package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/service"
)

type PracticeHandler struct {
	svc *service.PracticeSentenceService
}

func NewPracticeHandler(svc *service.PracticeSentenceService) *PracticeHandler {
	return &PracticeHandler{svc: svc}
}

func (h *PracticeHandler) NextSentence(c echo.Context) error {
	userID, err := requireUserID(c)
	if err != nil {
		return err
	}

	sentence, err := h.svc.NextSentence(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate sentence")
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":       sentence.ID,
		"text":     sentence.Text,
		"phonetic": sentence.Phonetic,
		"gloss":    sentence.Gloss,
	})
}
