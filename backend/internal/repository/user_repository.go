package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"englishapp/backend/internal/domain"
	"englishapp/backend/internal/repository/sqlcgen"
)

var ErrNotFound = errors.New("not found")

// IsUniqueViolation reports a Postgres unique-constraint error (SQLSTATE 23505), e.g. two
// registrations of one e-mail at the same moment.
func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

type UserRepository interface {
	Create(ctx context.Context, email, passwordHash string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error
}

type userRepository struct {
	q *sqlcgen.Queries
}

func NewUserRepository(pool *pgxpool.Pool) UserRepository {
	return &userRepository{q: sqlcgen.New(pool)}
}

func (r *userRepository) Create(ctx context.Context, email, passwordHash string) (*domain.User, error) {
	row, err := r.q.CreateUser(ctx, sqlcgen.CreateUserParams{Email: email, PasswordHash: passwordHash})
	if err != nil {
		return nil, err
	}
	return toDomainUser(row), nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(row), nil
}

func (r *userRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return toDomainUser(row), nil
}

func (r *userRepository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	return r.q.UpdateUserPassword(ctx, sqlcgen.UpdateUserPasswordParams{ID: id, PasswordHash: passwordHash})
}

func toDomainUser(row sqlcgen.User) *domain.User {
	u := &domain.User{
		ID:           row.ID,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		CreatedAt:    row.CreatedAt.Time,
	}
	if row.Level.Valid {
		u.Level = &row.Level.String
	}
	if row.TargetGoal.Valid {
		u.TargetGoal = &row.TargetGoal.String
	}
	return u
}
