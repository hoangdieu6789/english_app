package repository

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
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
	// UpdateGoals sets the self-estimated and target bands (nil clears).
	UpdateGoals(ctx context.Context, id uuid.UUID, selfBand, targetBand *float32) error
	UpdateLang(ctx context.Context, id uuid.UUID, lang string) error
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

func (r *userRepository) UpdateLang(ctx context.Context, id uuid.UUID, lang string) error {
	return r.q.UpdateUserLang(ctx, sqlcgen.UpdateUserLangParams{ID: id, Lang: lang})
}

func (r *userRepository) UpdateGoals(ctx context.Context, id uuid.UUID, selfBand, targetBand *float32) error {
	return r.q.UpdateUserGoals(ctx, sqlcgen.UpdateUserGoalsParams{ID: id, SelfBand: float4(selfBand), TargetBand: float4(targetBand)})
}

func float4(v *float32) pgtype.Float4 {
	if v == nil {
		return pgtype.Float4{}
	}
	return pgtype.Float4{Float32: *v, Valid: true}
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
	if row.SelfBand.Valid {
		u.SelfBand = &row.SelfBand.Float32
	}
	if row.TargetBand.Valid {
		u.TargetBand = &row.TargetBand.Float32
	}
	u.Lang = row.Lang
	return u
}
