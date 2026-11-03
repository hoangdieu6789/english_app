package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

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

// SubmitAttempt accepts multipart form fields:
//
//	audio          WAV file (16 kHz mono PCM)
//	referenceText  sentence to read; required for taskType=shadowing, empty for IELTS parts
//	taskType       "shadowing" (default) or an IELTS part: part1, part2, part3, full_test
//	taskPrompt     question(s) or cue card the learner answered (IELTS parts)
func (h *PronunciationHandler) SubmitAttempt(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}

	taskType := strings.TrimSpace(c.FormValue("taskType"))
	if taskType == "" {
		taskType = service.TaskShadowing
	}
	if !h.svc.HasTask(taskType) {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown taskType")
	}

	referenceText := c.FormValue("referenceText")
	if referenceText == "" && taskType == service.TaskShadowing {
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

	task := service.SpeakingTask{
		Type:   taskType,
		Prompt: c.FormValue("taskPrompt"),
	}
	attempt, err := h.svc.SubmitAttempt(c.Request().Context(), uid, audioBytes, referenceText, task)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to score pronunciation")
	}

	var rubricResult any // null when grading failed
	if len(attempt.Rubric) > 0 {
		rubricResult = json.RawMessage(attempt.Rubric)
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":                attempt.ID,
		"audioUrl":          attempt.AudioURL,
		"referenceText":     attempt.ReferenceText,
		"recognizedText":    attempt.RecognizedText,
		"taskType":          attempt.TaskType,
		"overallScore":      attempt.OverallScore,
		"fluencyScore":      attempt.FluencyScore,
		"completenessScore": attempt.CompletenessScore,
		"prosodyScore":      attempt.ProsodyScore,
		"pronScore":         attempt.PronScore,
		"wordScores":        attempt.WordScores,
		"phonemeScores":     attempt.PhonemeScores,
		"rubric":            rubricResult,
		"createdAt":         attempt.CreatedAt,
	})
}
