package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
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
		FeedbackLang:  c.FormValue("lang"), // vi | en; anything else = rubric default
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

	return c.JSON(http.StatusCreated, attemptJSON(attempt))
}

// GetAttempt returns one of the learner's attempts. While gradingStatus is "pending" the
// LLM criteria are still being graded; poll until it is "done" or "failed".
func (h *PronunciationHandler) GetAttempt(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid attempt id")
	}
	attempt, err := h.svc.Get(c.Request().Context(), id, uid)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load attempt")
	}
	if attempt == nil {
		return echo.NewHTTPError(http.StatusNotFound, "attempt not found")
	}
	return c.JSON(http.StatusOK, attemptJSON(attempt))
}

func attemptJSON(attempt *domain.PronunciationAttempt) map[string]any {
	var grader any // null when no LLM scored the attempt (shadowing, LLM failure, still pending)
	if attempt.GraderProvider != nil {
		grader = map[string]string{"provider": *attempt.GraderProvider, "model": deref(attempt.GraderModel)}
	}
	var rubricResult any // null when grading failed
	if len(attempt.Rubric) > 0 {
		rubricResult = json.RawMessage(attempt.Rubric)
	}
	return map[string]any{
		"id":                attempt.ID,
		"audioUrl":          attempt.AudioURL,
		"referenceText":     attempt.ReferenceText,
		"recognizedText":    attempt.RecognizedText,
		"taskType":          attempt.TaskType,
		"taskPrompt":        attempt.TaskPrompt,
		"feedbackLang":      attempt.FeedbackLang,
		"overallScore":      attempt.OverallScore,
		"fluencyScore":      attempt.FluencyScore,
		"completenessScore": attempt.CompletenessScore,
		"prosodyScore":      attempt.ProsodyScore,
		"pronScore":         attempt.PronScore,
		"wordScores":        attempt.WordScores,
		"phonemeScores":     attempt.PhonemeScores,
		"rubric":            rubricResult,
		"grader":            grader,
		"gradingStatus":     attempt.GradingStatus,
		"transcriptSource":  attempt.TranscriptSource,
		"improvedAnswer":    improvedJSON(attempt.ImprovedAnswer),
		"createdAt":         attempt.CreatedAt,
	}
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

// History lists the learner's attempts newest first (20 per page). Query: type (task type,
// empty = all), before (RFC 3339, from "next" of the previous page).
func (h *PronunciationHandler) History(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var before *time.Time
	if b := c.QueryParam("before"); b != "" {
		t, err := time.Parse(time.RFC3339Nano, b)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid before")
		}
		before = &t
	}
	taskType := c.QueryParam("type")
	if taskType != "" && !h.svc.HasTask(taskType) {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown task type")
	}
	hist, err := h.svc.History(c.Request().Context(), uid, taskType, before)
	if err != nil {
		log.Printf("history: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load history")
	}
	items := make([]map[string]any, 0, len(hist.Attempts))
	for _, a := range hist.Attempts {
		items = append(items, map[string]any{
			"id":             a.ID,
			"createdAt":      a.CreatedAt,
			"taskType":       a.TaskType,
			"taskPrompt":     a.TaskPrompt,
			"referenceText":  a.ReferenceText,
			"recognizedText": a.RecognizedText,
			"topic":          a.Topic,
			"overallScore":   a.OverallScore,
			"fluencyScore":   a.FluencyScore,
			"prosodyScore":   a.ProsodyScore,
			"band":           a.RubricScore,
			"cefr":           a.CEFRLevel,
			"gradingStatus":  a.GradingStatus,
		})
	}
	var next any
	if hist.Next != nil {
		next = hist.Next.Format(time.RFC3339Nano)
	}
	return c.JSON(http.StatusOK, map[string]any{"attempts": items, "counts": hist.Counts, "next": next})
}

func improvedJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return raw
}

// ScoreWord scores one recording of a single word (multipart "audio" + "word"); not saved.
func (h *PronunciationHandler) ScoreWord(c echo.Context) error {
	if _, err := requireUserID(c); err != nil {
		return err
	}
	word := strings.TrimSpace(c.FormValue("word"))
	if word == "" || len(word) > 40 || strings.ContainsAny(word, " \t\n") {
		return echo.NewHTTPError(http.StatusBadRequest, "one word is required")
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
	res, err := h.svc.ScoreWord(c.Request().Context(), audio, word)
	if err != nil {
		var noSpeech *service.NoSpeechError
		if errors.As(err, &noSpeech) {
			return echo.NewHTTPError(http.StatusUnprocessableEntity, "Không nhận ra lời nói trong bản ghi. Nói to và rõ hơn rồi thử lại.")
		}
		log.Printf("score word: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "Chấm điểm thất bại. Thử lại sau ít phút.")
	}
	score, phonemes := res.OverallScore, res.PhonemeScores
	if len(res.WordScores) > 0 {
		score, phonemes = res.WordScores[0].AccuracyScore, res.WordScores[0].Phonemes
		if res.WordScores[0].ErrorType == "omission" {
			score = 0
		}
	}
	if phonemes == nil {
		phonemes = []domain.PhonemeScore{}
	}
	return c.JSON(http.StatusOK, map[string]any{"word": word, "score": score, "heard": res.RecognizedText, "phonemes": phonemes})
}
