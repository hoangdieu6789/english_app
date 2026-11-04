package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/pkg/config"
)

var (
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrEmailTaken          = errors.New("email already registered")
	ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")
)

type AuthTokens struct {
	AccessToken  string
	RefreshToken string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	// Remember: false = "remember me" was unticked; the refresh cookie is a browser-session
	// cookie and the token lives sessionRefreshTTL (renewed on every refresh).
	Remember bool
}

// sessionRefreshTTL bounds a session that is not remembered.
const sessionRefreshTTL = 24 * time.Hour

// NormalizeEmail makes e-mail lookups case-insensitive: "Me@X.com " and "me@x.com" are one
// account (migration 000010 adds a unique index on lower(email)).
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

var ErrInvalidResetToken = errors.New("invalid or expired reset link")

const (
	passwordResetTTL      = 30 * time.Minute
	passwordResetsPerHour = 3
)

type AuthService struct {
	users         repository.UserRepository
	refreshTokens repository.RefreshTokenRepository
	cfg           *config.Config
	resets        repository.PasswordResetRepository // nil = password reset off
	mailer        Mailer
}

func NewAuthService(users repository.UserRepository, refreshTokens repository.RefreshTokenRepository, cfg *config.Config) *AuthService {
	return &AuthService{users: users, refreshTokens: refreshTokens, cfg: cfg}
}

// EnablePasswordReset turns on "forgot password": links are stored in resets and sent with
// mailer, pointing to cfg.FrontendOrigin + "/reset-password?token=...".
func (s *AuthService) EnablePasswordReset(resets repository.PasswordResetRepository, mailer Mailer) {
	s.resets, s.mailer = resets, mailer
}

// RequestPasswordReset e-mails a one-time link (valid 30 minutes) when the account exists.
// It reports nothing about whether the e-mail is registered, and sends at most 3 links per
// account per hour. The e-mail is sent in the background.
func (s *AuthService) RequestPasswordReset(ctx context.Context, email string) error {
	if s.resets == nil {
		return errors.New("password reset is not configured")
	}
	user, err := s.users.GetByEmail(ctx, NormalizeEmail(email))
	if errors.Is(err, repository.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("get user: %w", err)
	}
	n, err := s.resets.CountRecent(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("count reset links: %w", err)
	}
	if n >= passwordResetsPerHour {
		log.Printf("auth: password reset rate limit for user %s", user.ID)
		return nil
	}
	raw, err := generateRandomToken()
	if err != nil {
		return fmt.Errorf("generate reset token: %w", err)
	}
	if err := s.resets.Create(ctx, user.ID, hashToken(raw), time.Now().Add(passwordResetTTL)); err != nil {
		return fmt.Errorf("store reset token: %w", err)
	}
	link := strings.TrimRight(s.cfg.FrontendOrigin, "/") + "/reset-password?token=" + raw
	body := "Xin chào,\n\n" +
		"Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu SpeakUp cho " + user.Email + ".\n" +
		"Mở link sau trong 30 phút để đặt mật khẩu mới:\n\n" + link + "\n\n" +
		"Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu cũ vẫn dùng được.\n"
	go func(to string) {
		sendCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.mailer.Send(sendCtx, to, "SpeakUp: đặt lại mật khẩu", body); err != nil {
			log.Printf("auth: send password reset e-mail: %v", err)
		}
	}(user.Email)
	return nil
}

// ResetPassword sets a new password with a reset link token and signs the account out
// everywhere (all refresh tokens revoked).
func (s *AuthService) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	if s.resets == nil {
		return errors.New("password reset is not configured")
	}
	userID, err := s.resets.Use(ctx, hashToken(strings.TrimSpace(rawToken)))
	if errors.Is(err, repository.ErrNotFound) {
		return ErrInvalidResetToken
	}
	if err != nil {
		return fmt.Errorf("use reset token: %w", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	if err := s.users.UpdatePassword(ctx, userID, string(hash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if err := s.refreshTokens.RevokeAllForUser(ctx, userID); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}
	return nil
}

// Register creates the account and signs the learner in (remembered), so they go straight
// into the app.
func (s *AuthService) Register(ctx context.Context, email, password string) (*domain.User, *AuthTokens, error) {
	email = NormalizeEmail(email)
	_, err := s.users.GetByEmail(ctx, email)
	if err == nil {
		return nil, nil, ErrEmailTaken
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return nil, nil, fmt.Errorf("check existing user: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, email, string(hash))
	if err != nil {
		if repository.IsUniqueViolation(err) { // registered at the same moment
			return nil, nil, ErrEmailTaken
		}
		return nil, nil, fmt.Errorf("create user: %w", err)
	}
	tokens, err := s.issueTokens(ctx, user.ID, user.Email, true)
	if err != nil {
		return nil, nil, err
	}
	return user, tokens, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string, remember bool) (*domain.User, *AuthTokens, error) {
	user, err := s.users.GetByEmail(ctx, NormalizeEmail(email))
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.issueTokens(ctx, user.ID, user.Email, remember)
	if err != nil {
		return nil, nil, err
	}
	return user, tokens, nil
}

// Refresh rotates the refresh token: the presented token is revoked and a new
// pair is issued, so a stolen-but-already-used token cannot be replayed.
func (s *AuthService) Refresh(ctx context.Context, rawRefreshToken string) (*AuthTokens, error) {
	hash := hashToken(rawRefreshToken)

	existing, err := s.refreshTokens.GetByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("get refresh token: %w", err)
	}

	if existing.RevokedAt != nil || existing.ExpiresAt.Before(time.Now()) {
		return nil, ErrInvalidRefreshToken
	}

	if err := s.refreshTokens.Revoke(ctx, existing.ID); err != nil {
		return nil, fmt.Errorf("revoke refresh token: %w", err)
	}

	user, err := s.users.GetByID(ctx, existing.UserID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	return s.issueTokens(ctx, user.ID, user.Email, existing.Remember)
}

func (s *AuthService) Logout(ctx context.Context, rawRefreshToken string) error {
	hash := hashToken(rawRefreshToken)
	existing, err := s.refreshTokens.GetByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil
		}
		return fmt.Errorf("get refresh token: %w", err)
	}
	if err := s.refreshTokens.Revoke(ctx, existing.ID); err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

func (s *AuthService) Me(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}
	return user, nil
}

func (s *AuthService) issueTokens(ctx context.Context, userID uuid.UUID, email string, remember bool) (*AuthTokens, error) {
	accessToken, err := s.generateAccessToken(userID, email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	rawRefresh, err := generateRandomToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	refreshTTL := s.cfg.RefreshTokenTTL
	if !remember && sessionRefreshTTL < refreshTTL {
		refreshTTL = sessionRefreshTTL
	}
	_, err = s.refreshTokens.Create(ctx, userID, hashToken(rawRefresh), time.Now().Add(refreshTTL), remember)
	if err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &AuthTokens{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		AccessTTL:    s.cfg.AccessTokenTTL,
		RefreshTTL:   refreshTTL,
		Remember:     remember,
	}, nil
}

func (s *AuthService) generateAccessToken(userID uuid.UUID, email string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID.String(),
		"email": email,
		"exp":   time.Now().Add(s.cfg.AccessTokenTTL).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTAccessSecret))
}

func generateRandomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
