package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

type RefreshTokenRepository interface {
	Create(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) (*domain.RefreshToken, error)
	GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error)
	Revoke(ctx context.Context, id uuid.UUID) error
	RevokeAllForUser(ctx context.Context, userID uuid.UUID) error
}

type refreshTokenRepository struct {
	q *sqlcgen.Queries
}

func NewRefreshTokenRepository(pool *pgxpool.Pool) RefreshTokenRepository {
	return &refreshTokenRepository{q: sqlcgen.New(pool)}
}

func (r *refreshTokenRepository) Create(ctx context.Context, userID uuid.UUID, tokenHash string, expiresAt time.Time) (*domain.RefreshToken, error) {
	row, err := r.q.CreateRefreshToken(ctx, sqlcgen.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: tokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	return toDomainRefreshToken(row), nil
}

func (r *refreshTokenRepository) GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	row, err := r.q.GetRefreshTokenByHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return toDomainRefreshToken(row), nil
}

func (r *refreshTokenRepository) Revoke(ctx context.Context, id uuid.UUID) error {
	return r.q.RevokeRefreshToken(ctx, id)
}

func (r *refreshTokenRepository) RevokeAllForUser(ctx context.Context, userID uuid.UUID) error {
	return r.q.RevokeAllUserRefreshTokens(ctx, userID)
}

func toDomainRefreshToken(row sqlcgen.RefreshToken) *domain.RefreshToken {
	rt := &domain.RefreshToken{
		ID:        row.ID,
		UserID:    row.UserID,
		TokenHash: row.TokenHash,
		ExpiresAt: row.ExpiresAt.Time,
		CreatedAt: row.CreatedAt.Time,
	}
	if row.RevokedAt.Valid {
		rt.RevokedAt = &row.RevokedAt.Time
	}
	return rt
}
