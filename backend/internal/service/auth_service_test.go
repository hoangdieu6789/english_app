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

func (m *memUsers) UpdatePassword(_ context.Context, id uuid.UUID, hash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			u.PasswordHash = hash
		}
	}
	return nil
}

func (m *memUsers) UpdateGoals(_ context.Context, id uuid.UUID, self, target *float32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			u.SelfBand, u.TargetBand = self, target
		}
	}
	return nil
}

func (m *memUsers) UpdateFeedbackLang(_ context.Context, id uuid.UUID, lang string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			u.FeedbackLang = lang
			return nil
		}
	}
	return nil
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

func (m *memTokens) RevokeAllForUser(_ context.Context, uid uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	for _, t := range m.tokens {
		if t.UserID == uid {
			t.RevokedAt = &now
		}
	}
	return nil
}

type memResets struct {
	mu   sync.Mutex
	rows []*resetRow
}

type resetRow struct {
	user    uuid.UUID
	hash    string
	expires time.Time
	used    bool
}

func (m *memResets) Create(_ context.Context, uid uuid.UUID, hash string, exp time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows = append(m.rows, &resetRow{user: uid, hash: hash, expires: exp})
	return nil
}

func (m *memResets) CountRecent(_ context.Context, uid uuid.UUID) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, r := range m.rows {
		if r.user == uid {
			n++
		}
	}
	return n, nil
}

func (m *memResets) Use(_ context.Context, hash string) (uuid.UUID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.rows {
		if r.hash == hash && !r.used && r.expires.After(time.Now()) {
			r.used = true
			return r.user, nil
		}
	}
	return uuid.UUID{}, repository.ErrNotFound
}

// captureMailer keeps the sent e-mails.
type captureMailer struct {
	mu   sync.Mutex
	sent []string // "to|body"
	done chan struct{}
}

func (c *captureMailer) Send(_ context.Context, to, _, body string) error {
	c.mu.Lock()
	c.sent = append(c.sent, to+"|"+body)
	c.mu.Unlock()
	c.done <- struct{}{}
	return nil
}

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

func TestPasswordReset(t *testing.T) {
	cfg := &config.Config{JWTAccessSecret: "s", AccessTokenTTL: time.Minute, RefreshTokenTTL: time.Hour, FrontendOrigin: "http://english.localhost/"}
	tokens, resets := &memTokens{}, &memResets{}
	svc := NewAuthService(&memUsers{}, tokens, cfg)
	mail := &captureMailer{done: make(chan struct{}, 10)}
	svc.EnablePasswordReset(resets, mail)
	ctx := context.Background()
	if _, _, err := svc.Register(ctx, "a@example.com", "OldPassw0rd!"); err != nil {
		t.Fatal(err)
	}

	// Unknown e-mail: no error (nothing revealed), no mail.
	if err := svc.RequestPasswordReset(ctx, "nobody@example.com"); err != nil || len(resets.rows) != 0 {
		t.Fatalf("unknown e-mail: err=%v rows=%d", err, len(resets.rows))
	}
	if err := svc.RequestPasswordReset(ctx, "A@Example.com"); err != nil {
		t.Fatal(err)
	}
	<-mail.done
	body := mail.sent[0]
	i := strings.Index(body, "http://english.localhost/reset-password?token=")
	if !strings.HasPrefix(body, "a@example.com|") || i < 0 {
		t.Fatalf("mail = %q", body)
	}
	raw := strings.Fields(body[i+len("http://english.localhost/reset-password?token="):])[0]
	if resets.rows[0].hash == raw {
		t.Fatal("the raw token must not be stored")
	}

	if err := svc.ResetPassword(ctx, "wrong-token", "NewPassw0rd!"); !errors.Is(err, ErrInvalidResetToken) {
		t.Fatalf("wrong token: %v", err)
	}
	if err := svc.ResetPassword(ctx, raw, "NewPassw0rd!"); err != nil {
		t.Fatal(err)
	}
	if err := svc.ResetPassword(ctx, raw, "Another0ne!"); !errors.Is(err, ErrInvalidResetToken) {
		t.Fatalf("a link works once: %v", err)
	}
	if _, _, err := svc.Login(ctx, "a@example.com", "OldPassw0rd!", true); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("old password still works: %v", err)
	}
	if _, _, err := svc.Login(ctx, "a@example.com", "NewPassw0rd!", true); err != nil {
		t.Fatalf("new password: %v", err)
	}
	revoked := 0
	for _, tk := range tokens.tokens {
		if tk.RevokedAt != nil {
			revoked++
		}
	}
	if revoked == 0 {
		t.Error("reset must sign the account out (revoke refresh tokens)")
	}

	// Rate limit: 3 links per hour (1 already sent).
	for i := 0; i < 4; i++ {
		if err := svc.RequestPasswordReset(ctx, "a@example.com"); err != nil {
			t.Fatal(err)
		}
	}
	if len(resets.rows) != passwordResetsPerHour {
		t.Errorf("links = %d, want %d", len(resets.rows), passwordResetsPerHour)
	}
}
