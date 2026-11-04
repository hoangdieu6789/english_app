package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/repository/sqlcgen"
)

type PasswordResetRepository interface {
	Create(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) error
	CountRecent(ctx context.Context, userID uuid.UUID) (int, error)
	// Use marks a valid token used and returns its user; ErrNotFound when the token is
	// unknown, expired or already used.
	Use(ctx context.Context, tokenHash string) (uuid.UUID, error)
}

type passwordResetRepository struct {
	q *sqlcgen.Queries
}

func NewPasswordResetRepository(pool *pgxpool.Pool) PasswordResetRepository {
	return &passwordResetRepository{q: sqlcgen.New(pool)}
}

func (r *passwordResetRepository) Create(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) error {
	return r.q.CreatePasswordResetToken(ctx, sqlcgen.CreatePasswordResetTokenParams{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
}

func (r *passwordResetRepository) CountRecent(ctx context.Context, userID uuid.UUID) (int, error) {
	n, err := r.q.CountRecentPasswordResets(ctx, userID)
	return int(n), err
}

func (r *passwordResetRepository) Use(ctx context.Context, tokenHash string) (uuid.UUID, error) {
	id, err := r.q.UsePasswordResetToken(ctx, tokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.UUID{}, ErrNotFound
	}
	return id, err
}
