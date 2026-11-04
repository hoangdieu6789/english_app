package handler

import (
	"errors"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
	"englishapp/backend/internal/repository"
	"englishapp/backend/internal/service"
)

type CoachHandler struct {
	svc *service.CoachService
}

func NewCoachHandler(svc *service.CoachService) *CoachHandler {
	return &CoachHandler{svc: svc}
}

func RegisterCoachRoutes(api *echo.Group, h *CoachHandler, jwtAuth *middleware.JWTAuth) {
	api.POST("/coach/sample", h.Sample, jwtAuth.RequireAuth)
	api.POST("/pronunciation/attempts/:id/improve", h.Improve, jwtAuth.RequireAuth)
}

type sampleRequest struct {
	TaskType string `json:"taskType"`
	Question string `json:"question"` // the question, or the cue card text for Part 2
	Lang     string `json:"lang"`     // vi | en: language of the phrase meanings and tips
}

func coachError(err error) error {
	switch {
	case errors.Is(err, repository.ErrNotFound):
		return echo.NewHTTPError(http.StatusNotFound, "attempt not found")
	case errors.Is(err, service.ErrNotIELTSTask), errors.Is(err, service.ErrNoTranscript):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrCoachUnavailable):
		log.Printf("coach: %v", err)
		return echo.NewHTTPError(http.StatusServiceUnavailable, "AI is busy; try again in a few minutes")
	default:
		log.Printf("coach: %v", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to write the answer")
	}
}

// Sample returns a model answer at the learner's target band (cached and shared).
func (h *CoachHandler) Sample(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	var req sampleRequest
	if err := c.Bind(&req); err != nil || req.Question == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "taskType and question are required")
	}
	out, err := h.svc.Sample(c.Request().Context(), uid, req.TaskType, req.Question, req.Lang)
	if err != nil {
		return coachError(err)
	}
	return c.JSON(http.StatusOK, out)
}

// Improve rewrites the learner's answer of an attempt at their target band.
func (h *CoachHandler) Improve(c echo.Context) error {
	uid, err := requireUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid attempt id")
	}
	out, err := h.svc.Improve(c.Request().Context(), uid, id, c.QueryParam("lang"))
	if err != nil {
		return coachError(err)
	}
	return c.JSON(http.StatusOK, out)
}
