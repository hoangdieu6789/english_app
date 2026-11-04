package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository"
	"englishapp/backend/pkg/config"
)

type memUsers struct {
	mu    sync.Mutex
	users map[string]*domain.User
}

func (m *memUsers) Create(_ context.Context, email, hash string) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.users == nil {
		m.users = map[string]*domain.User{}
	}
	u := &domain.User{ID: uuid.New(), Email: email, PasswordHash: hash}
	m.users[email] = u
	return u, nil
}

// GetByEmail matches exactly, like a plain "email = $1": the service must normalise.
func (m *memUsers) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if u, ok := m.users[email]; ok {
		return u, nil
	}
	return nil, repository.ErrNotFound
}

func (m *memUsers) GetByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, repository.ErrNotFound
}

type memTokens struct {
	mu     sync.Mutex
	tokens map[string]*domain.RefreshToken
}

func (m *memTokens) Create(_ context.Context, uid uuid.UUID, hash string, exp time.Time, remember bool) (*domain.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.tokens == nil {
		m.tokens = map[string]*domain.RefreshToken{}
	}
	t := &domain.RefreshToken{ID: uuid.New(), UserID: uid, TokenHash: hash, ExpiresAt: exp, Remember: remember}
	m.tokens[hash] = t
	return t, nil
}

func (m *memTokens) GetByHash(_ context.Context, hash string) (*domain.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if t, ok := m.tokens[hash]; ok {
		return t, nil
	}
	return nil, repository.ErrNotFound
}

func (m *memTokens) Revoke(_ context.Context, id uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for _, t := range m.tokens {
		if t.ID == id {
			t.RevokedAt = &now
		}
	}
	return nil
}

func (m *memTokens) RevokeAllForUser(context.Context, uuid.UUID) error { return nil }

func newTestAuth() *AuthService {
	cfg := &config.Config{JWTAccessSecret: "test-secret", AccessTokenTTL: 15 * time.Minute, RefreshTokenTTL: 30 * 24 * time.Hour}
	return NewAuthService(&memUsers{}, &memTokens{}, cfg)
}

func TestAuthEmailIsCaseInsensitive(t *testing.T) {
	svc := newTestAuth()
	ctx := context.Background()
	u, tokens, err := svc.Register(ctx, "  Learner@Example.COM ", "Passw0rd!long")
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "learner@example.com" || tokens == nil || tokens.AccessToken == "" || !tokens.Remember {
		t.Fatalf("register: email=%q tokens=%+v", u.Email, tokens)
	}
	if _, _, err := svc.Register(ctx, "learner@example.com", "Passw0rd!long"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("second account with another case: err = %v", err)
	}
	for _, e := range []string{"LEARNER@example.com", "learner@example.com ", "Learner@Example.Com"} {
		if _, _, err := svc.Login(ctx, e, "Passw0rd!long", true); err != nil {
			t.Errorf("login %q: %v", e, err)
		}
	}
	if _, _, err := svc.Login(ctx, "learner@example.com", "wrong-password", true); !errors.Is(err, ErrInvalidCredentials) {
		t.Errorf("wrong password: %v", err)
	}
}

func TestAuthRememberMe(t *testing.T) {
	svc := newTestAuth()
	ctx := context.Background()
	if _, _, err := svc.Register(ctx, "a@example.com", "Passw0rd!long"); err != nil {
		t.Fatal(err)
	}
	_, short, err := svc.Login(ctx, "a@example.com", "Passw0rd!long", false)
	if err != nil {
		t.Fatal(err)
	}
	if short.Remember || short.RefreshTTL != sessionRefreshTTL {
		t.Fatalf("not remembered: %+v", short)
	}
	// Rotation keeps the choice.
	next, err := svc.Refresh(ctx, short.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if next.Remember || next.RefreshTTL != sessionRefreshTTL || strings.EqualFold(next.RefreshToken, short.RefreshToken) {
		t.Fatalf("refreshed: %+v", next)
	}
	_, long, err := svc.Login(ctx, "a@example.com", "Passw0rd!long", true)
	if err != nil {
		t.Fatal(err)
	}
	if !long.Remember || long.RefreshTTL != 30*24*time.Hour {
		t.Fatalf("remembered: %+v", long)
	}
}
