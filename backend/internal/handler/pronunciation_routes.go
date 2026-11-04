package handler

import (
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
)

func RegisterPronunciationRoutes(api *echo.Group, h *PronunciationHandler, jwtAuth *middleware.JWTAuth) {
	pron := api.Group("/pronunciation")
	pron.POST("/attempts", h.SubmitAttempt, jwtAuth.RequireAuth)
	pron.GET("/attempts", h.History, jwtAuth.RequireAuth)
	pron.POST("/word", h.ScoreWord, jwtAuth.RequireAuth)
	pron.GET("/attempts/:id", h.GetAttempt, jwtAuth.RequireAuth)
}
