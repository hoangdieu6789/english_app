package handler

import (
	"io"
	"net/http"

	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/service"
)

const maxAudioUploadBytes = 10 << 20 // 10 MB

type PronunciationHandler struct {
	svc *service.PronunciationService
}

func NewPronunciationHandler(svc *service.PronunciationService) *PronunciationHandler {
	return &PronunciationHandler{svc: svc}
}

func (h *PronunciationHandler) SubmitAttempt(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}

	referenceText := c.FormValue("referenceText")
	if referenceText == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "missing referenceText")
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

	audioBytes, err := io.ReadAll(file)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to read audio file")
	}

	attempt, err := h.svc.SubmitAttempt(c.Request().Context(), uid, audioBytes, referenceText)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to score pronunciation")
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":             attempt.ID,
		"audioUrl":       attempt.AudioURL,
		"referenceText":  attempt.ReferenceText,
		"recognizedText": attempt.RecognizedText,
		"overallScore":   attempt.OverallScore,
		"fluencyScore":   attempt.FluencyScore,
		"wordScores":     attempt.WordScores,
		"phonemeScores":  attempt.PhonemeScores,
		"createdAt":      attempt.CreatedAt,
	})
}
