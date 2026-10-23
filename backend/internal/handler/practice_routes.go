package handler

import (
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
)

func RegisterPracticeRoutes(api *echo.Group, h *PracticeHandler, jwtAuth *middleware.JWTAuth) {
	practice := api.Group("/practice")
	practice.GET("/sentence", h.NextSentence, jwtAuth.RequireAuth)
}
