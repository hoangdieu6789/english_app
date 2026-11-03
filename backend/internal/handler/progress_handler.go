package handler

import (
	"net/http"
	"time"
	_ "time/tzdata" // the API image has no system zoneinfo

	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/service"
)

const defaultProgressTZ = "Asia/Ho_Chi_Minh"

type ProgressHandler struct {
	svc *service.ProgressService
}

func NewProgressHandler(svc *service.ProgressService) *ProgressHandler {
	return &ProgressHandler{svc: svc}
}

func RegisterProgressRoutes(api *echo.Group, h *ProgressHandler, jwtAuth *middleware.JWTAuth) {
	api.GET("/progress/summary", h.Summary, jwtAuth.RequireAuth)
}

// Summary returns the learner's progress. ?tz= is an IANA time zone (default Asia/Ho_Chi_Minh)
// used for days, weeks and the streak.
func (h *ProgressHandler) Summary(c echo.Context) error {
	userID, err := requireUserID(c)
	if err != nil {
		return err
	}
	tz := c.QueryParam("tz")
	if tz == "" {
		tz = defaultProgressTZ
	}
	loc, err := time.LoadLocation(tz)
	if err != nil || tz == "Local" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid tz")
	}
	sum, err := h.svc.Summary(c.Request().Context(), userID, loc)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load progress")
	}
	return c.JSON(http.StatusOK, toProgressJSON(sum, tz))
}

func toProgressJSON(s *domain.ProgressSummary, tz string) map[string]any {
	weeks := make([]map[string]any, 0, len(s.Weeks))
	for _, w := range s.Weeks {
		weeks = append(weeks, map[string]any{
			"start": w.Start.Format("2006-01-02"), "attempts": w.Attempts,
			"accuracy": w.Accuracy, "fluency": w.Fluency, "band": w.Band,
		})
	}
	phonemes := make([]map[string]any, 0, len(s.HardPhonemes))
	for _, p := range s.HardPhonemes {
		phonemes = append(phonemes, map[string]any{"phoneme": p.Phoneme, "score": p.Score, "samples": p.Samples})
	}
	criteria := make([]map[string]any, 0, len(s.Criteria))
	for _, c := range s.Criteria {
		criteria = append(criteria, map[string]any{"criterion": c.Criterion, "band": c.Band, "samples": c.Samples})
	}
	tasks := make([]map[string]any, 0, len(s.ByTask))
	for _, t := range s.ByTask {
		tasks = append(tasks, map[string]any{"taskType": t.TaskType, "attempts": t.Attempts, "avgBand": t.AvgBand, "bestBand": t.BestBand})
	}
	graders := make([]map[string]any, 0, len(s.Graders))
	for _, g := range s.Graders {
		graders = append(graders, map[string]any{"provider": g.Provider, "model": g.Model, "attempts": g.Attempts})
	}
	words := make([]map[string]any, 0, len(s.WeakWords))
	for _, w := range s.WeakWords {
		words = append(words, map[string]any{"word": w.Word, "score": w.Score, "times": w.Times})
	}
	return map[string]any{
		"speakingSecondsToday": s.SpeakingSecondsToday,
		"weakWords":            words,
		"tz":                   tz,
		"streak":               s.Streak,
		"activeDays":           s.ActiveDays,
		"attempts":             s.Attempts,
		"attemptsToday":        s.AttemptsToday,
		"last30Days": map[string]any{
			"attempts": s.Last30Days.Attempts, "accuracy": s.Last30Days.Accuracy, "fluency": s.Last30Days.Fluency,
			"band": s.Last30Days.Band, "banded": s.Last30Days.Banded,
		},
		"weeks":        weeks,
		"hardPhonemes": phonemes,
		"criteria":     criteria,
		"byTask":       tasks,
		"graders":      graders,
	}
}
