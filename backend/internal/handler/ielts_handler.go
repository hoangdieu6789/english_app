package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/service"
)

type IeltsHandler struct {
	svc *service.IeltsQuestionService
}

func NewIeltsHandler(svc *service.IeltsQuestionService) *IeltsHandler {
	return &IeltsHandler{svc: svc}
}

func RegisterIeltsRoutes(api *echo.Group, h *IeltsHandler, jwtAuth *middleware.JWTAuth) {
	ielts := api.Group("/ielts")
	ielts.GET("/next", h.Next, jwtAuth.RequireAuth)
	ielts.GET("/sets", h.List, jwtAuth.RequireAuth)
}

type questionSetJSON struct {
	ID        uuid.UUID `json:"id"`
	Kind      string    `json:"kind"`
	Topic     string    `json:"topic"`
	Prompt    string    `json:"prompt"`
	Points    []string  `json:"points"`
	Questions []string  `json:"questions"`
	Source    string    `json:"source"`
}

func toQuestionSetJSON(s domain.QuestionSet) questionSetJSON {
	return questionSetJSON{ID: s.ID, Kind: s.Kind, Topic: s.Topic, Prompt: s.Prompt, Points: s.Points, Questions: s.Questions, Source: s.Source}
}

// Next returns a set the learner has not done for ?part=part1|part2|part3 (?exclude=<id>
// skips the set on screen). "seen": true means every set is done and this one is a review.
func (h *IeltsHandler) Next(c echo.Context) error {
	userID, err := requireUserID(c)
	if err != nil {
		return err
	}
	var exclude *uuid.UUID
	if raw := c.QueryParam("exclude"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid exclude")
		}
		exclude = &id
	}
	next, err := h.svc.Next(c.Request().Context(), userID, c.QueryParam("part"), exclude)
	if errors.Is(err, service.ErrUnknownPart) {
		return echo.NewHTTPError(http.StatusBadRequest, "part must be part1, part2 or part3")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load question set")
	}
	return c.JSON(http.StatusOK, map[string]any{
		"set":         toQuestionSetJSON(*next.Set),
		"seen":        next.Seen,
		"unseenCount": next.Unseen,
	})
}

// List returns every set for ?part= with the learner's progress, done sets first.
func (h *IeltsHandler) List(c echo.Context) error {
	userID, err := requireUserID(c)
	if err != nil {
		return err
	}
	sets, err := h.svc.List(c.Request().Context(), userID, c.QueryParam("part"))
	if errors.Is(err, service.ErrUnknownPart) {
		return echo.NewHTTPError(http.StatusBadRequest, "part must be part1, part2 or part3")
	}
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list question sets")
	}
	type item struct {
		questionSetJSON
		AttemptCount  int        `json:"attemptCount"`
		LastAttemptAt *time.Time `json:"lastAttemptAt"`
		BestBand      *float32   `json:"bestBand"`
	}
	out := make([]item, 0, len(sets))
	for _, s := range sets {
		out = append(out, item{toQuestionSetJSON(s.QuestionSet), s.AttemptCount, s.LastAttemptAt, s.BestBand})
	}
	return c.JSON(http.StatusOK, map[string]any{"sets": out})
}
