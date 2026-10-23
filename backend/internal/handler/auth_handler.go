package handler

import (
	"errors"
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"

	"englishapp/backend/internal/service"
	"englishapp/backend/pkg/config"
)

const (
	accessCookieName  = "access_token"
	refreshCookieName = "refresh_token"
)

var validate = validator.New()

type AuthHandler struct {
	svc *service.AuthService
	cfg *config.Config
}

func NewAuthHandler(svc *service.AuthService, cfg *config.Config) *AuthHandler {
	return &AuthHandler{svc: svc, cfg: cfg}
}

type registerRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

func (h *AuthHandler) Register(c echo.Context) error {
	var req registerRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := validate.Struct(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	user, err := h.svc.Register(c.Request().Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrEmailTaken) {
			return echo.NewHTTPError(http.StatusConflict, "email already registered")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to register")
	}

	return c.JSON(http.StatusCreated, map[string]any{
		"id":    user.ID,
		"email": user.Email,
	})
}

type loginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}
	if err := validate.Struct(req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	user, tokens, err := h.svc.Login(c.Request().Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid email or password")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to login")
	}

	h.setAuthCookies(c, tokens)
	return c.JSON(http.StatusOK, map[string]any{
		"id":    user.ID,
		"email": user.Email,
	})
}

func (h *AuthHandler) Refresh(c echo.Context) error {
	cookie, err := c.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing refresh token")
	}

	tokens, err := h.svc.Refresh(c.Request().Context(), cookie.Value)
	if err != nil {
		if errors.Is(err, service.ErrInvalidRefreshToken) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired refresh token")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to refresh")
	}

	h.setAuthCookies(c, tokens)
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) Logout(c echo.Context) error {
	if cookie, err := c.Cookie(refreshCookieName); err == nil && cookie.Value != "" {
		if err := h.svc.Logout(c.Request().Context(), cookie.Value); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to logout")
		}
	}
	h.clearAuthCookies(c)
	return c.NoContent(http.StatusNoContent)
}

func (h *AuthHandler) Me(c echo.Context) error {
	userID, err := requireUserID(c)
	if err != nil {
		return err
	}

	user, err := h.svc.Me(c.Request().Context(), userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "not authenticated")
	}

	return c.JSON(http.StatusOK, map[string]any{
		"id":    user.ID,
		"email": user.Email,
	})
}

func (h *AuthHandler) setAuthCookies(c echo.Context, tokens *service.AuthTokens) {
	c.SetCookie(&http.Cookie{
		Name:     accessCookieName,
		Value:    tokens.AccessToken,
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   int(tokens.AccessTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	c.SetCookie(&http.Cookie{
		Name:     refreshCookieName,
		Value:    tokens.RefreshToken,
		Path:     "/api/auth",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   int(tokens.RefreshTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearAuthCookies(c echo.Context) {
	c.SetCookie(&http.Cookie{
		Name:     accessCookieName,
		Value:    "",
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	c.SetCookie(&http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}
