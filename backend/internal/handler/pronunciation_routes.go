package handler

import (
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
)

func RegisterPronunciationRoutes(api *echo.Group, h *PronunciationHandler, jwtAuth *middleware.JWTAuth) {
	pron := api.Group("/pronunciation")
	pron.POST("/attempts", h.SubmitAttempt, jwtAuth.RequireAuth)
}
