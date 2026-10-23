package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/middleware"
)

func requireUserID(c echo.Context) (uuid.UUID, error) {
	userID, ok := c.Get(middleware.ContextKeyUserID).(uuid.UUID)
	if !ok {
		return uuid.UUID{}, echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}
	return userID, nil
}
