package handler

import (
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
)

func RegisterAuthRoutes(api *echo.Group, h *AuthHandler, jwtAuth *middleware.JWTAuth) {
	auth := api.Group("/auth")
	auth.POST("/register", h.Register)
	auth.POST("/login", h.Login)
	auth.POST("/refresh", h.Refresh)
	auth.POST("/logout", h.Logout)
	auth.POST("/forgot-password", h.ForgotPassword)
	auth.POST("/reset-password", h.ResetPassword)
	auth.GET("/me", h.Me, jwtAuth.RequireAuth)
}
