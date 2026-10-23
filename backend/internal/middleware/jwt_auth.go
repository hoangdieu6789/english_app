package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"englishapp/backend/pkg/config"
)

const ContextKeyUserID = "user_id"

const AccessTokenCookieName = "access_token"

type JWTAuth struct {
	cfg *config.Config
}

func NewJWTAuth(cfg *config.Config) *JWTAuth {
	return &JWTAuth{cfg: cfg}
}

// RequireAuth reads the access token from the Authorization: Bearer header
// first (mobile clients), falling back to the httpOnly cookie (web clients).
func (a *JWTAuth) RequireAuth(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		raw := a.extractToken(c)
		if raw == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "missing access token")
		}

		token, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(a.cfg.JWTAccessSecret), nil
		})
		if err != nil || !token.Valid {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired access token")
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid token claims")
		}

		sub, _ := claims["sub"].(string)
		userID, err := uuid.Parse(sub)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid subject claim")
		}

		c.Set(ContextKeyUserID, userID)
		return next(c)
	}
}

func (a *JWTAuth) extractToken(c echo.Context) string {
	if h := c.Request().Header.Get("Authorization"); h != "" {
		parts := strings.SplitN(h, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return parts[1]
		}
	}
	if cookie, err := c.Cookie(AccessTokenCookieName); err == nil {
		return cookie.Value
	}
	return ""
}
