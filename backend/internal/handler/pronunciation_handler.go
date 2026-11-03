package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/service"
)

const maxAudioUploadBytes = 10 << 20 // 10 MB

type PronunciationHandler struct {
	svc       *service.PronunciationService
	questions *service.IeltsQuestionService
}

func NewPronunciationHandler(svc *service.PronunciationService, questions *service.IeltsQuestionService) *PronunciationHandler {
	return &PronunciationHandler{svc: svc, questions: questions}
}

// SubmitAttempt accepts multipart form fields:
//
//	audio          WAV file (16 kHz mono PCM)
//	referenceText  sentence to read; required for taskType=shadowing, empty for IELTS parts
//	taskType       "shadowing" (default) or an IELTS part: part1, part2, part3, full_test
//	taskPrompt     question(s) or cue card the learner answered (IELTS parts)
//	questionSetId  IELTS question set answered (optional; GET /api/ielts/next), so the
//	               learner's progress per set can be tracked
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

	questionSetID, err := h.questionSetID(c, taskType)
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

	audioBytes, err := io.ReadAll(file)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to read audio file")
	}

	task := service.SpeakingTask{
		Type:          taskType,
		Prompt:        c.FormValue("taskPrompt"),
		QuestionSetID: questionSetID,
	}
	attempt, err := h.svc.SubmitAttempt(c.Request().Context(), uid, audioBytes, referenceText, task)
	if err != nil {
		log.Printf("submit attempt: user=%s task=%s: %v", uid, taskType, err)
		var noSpeech *service.NoSpeechError
		if errors.As(err, &noSpeech) {
			// Learner-facing text stays in Vietnamese.
			return echo.NewHTTPError(http.StatusUnprocessableEntity,
				"Không nhận ra lời nói trong bản ghi (Azure: "+noSpeech.Status+"). Kiểm tra micro, nói to và rõ hơn rồi thử lại.")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "Chấm điểm thất bại. Thử lại sau ít phút.")
	}

	var grader any // null when no LLM scored the attempt (shadowing, LLM failure)
	if attempt.GraderProvider != nil {
		grader = map[string]string{"provider": *attempt.GraderProvider, "model": deref(attempt.GraderModel)}
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
		"grader":            grader,
		"createdAt":         attempt.CreatedAt,
	})
}

// questionSetID reads the optional questionSetId field and checks that the set exists and
// belongs to the task's IELTS part.
func (h *PronunciationHandler) questionSetID(c echo.Context, taskType string) (*uuid.UUID, error) {
	raw := strings.TrimSpace(c.FormValue("questionSetId"))
	if raw == "" {
		return nil, nil
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "invalid questionSetId")
	}
	kind, err := service.QuestionKindForPart(taskType)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "questionSetId needs taskType part1, part2 or part3")
	}
	set, err := h.questions.Get(c.Request().Context(), id)
	if err != nil {
		return nil, echo.NewHTTPError(http.StatusInternalServerError, "failed to load question set")
	}
	if set == nil || set.Kind != kind {
		return nil, echo.NewHTTPError(http.StatusBadRequest, "unknown questionSetId for this taskType")
	}
	return &id, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
