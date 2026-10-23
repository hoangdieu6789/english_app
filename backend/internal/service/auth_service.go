package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/pkg/config"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")
)

type AuthTokens struct {
	AccessToken  string
	RefreshToken string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
}

type AuthService struct {
	users         repository.UserRepository
	refreshTokens repository.RefreshTokenRepository
	cfg           *config.Config
}

func NewAuthService(users repository.UserRepository, refreshTokens repository.RefreshTokenRepository, cfg *config.Config) *AuthService {
	return &AuthService{users: users, refreshTokens: refreshTokens, cfg: cfg}
}

func (s *AuthService) Register(ctx context.Context, email, password string) (*domain.User, error) {
	_, err := s.users.GetByEmail(ctx, email)
	if err == nil {
		return nil, ErrEmailTaken
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return nil, fmt.Errorf("check existing user: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.users.Create(ctx, email, string(hash))
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*domain.User, *AuthTokens, error) {
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrInvalidCredentials
		}
		return nil, nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, nil, ErrInvalidCredentials
	}

	tokens, err := s.issueTokens(ctx, user.ID, user.Email)
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

	return s.issueTokens(ctx, user.ID, user.Email)
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

func (s *AuthService) issueTokens(ctx context.Context, userID uuid.UUID, email string) (*AuthTokens, error) {
	accessToken, err := s.generateAccessToken(userID, email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	rawRefresh, err := generateRandomToken()
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	_, err = s.refreshTokens.Create(ctx, userID, hashToken(rawRefresh), time.Now().Add(s.cfg.RefreshTokenTTL))
	if err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &AuthTokens{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		AccessTTL:    s.cfg.AccessTokenTTL,
		RefreshTTL:   s.cfg.RefreshTokenTTL,
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
