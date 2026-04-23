// Package postgres provides pgx-backed repository implementations.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

type userRepository struct {
	pool *pgxpool.Pool
}

type scanner interface {
	Scan(dest ...any) error
}

// NewUserRepository creates a PostgreSQL-backed user repository.
func NewUserRepository(pool *pgxpool.Pool) repository.UserRepository {
	return &userRepository{pool: pool}
}

func (r *userRepository) GetByID(ctx context.Context, id string) (*models.Profile, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, COALESCE(NULLIF(p.email, ''), u.email, ''), p.full_name, p.role, p.approval_status, p.approved_by, p.approved_at, p.created_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON u.id = p.id
		WHERE p.id = $1
	`, id)

	profile, err := scanProfile(row)
	if err != nil {
		return nil, fmt.Errorf("get user by id %q: %w", id, err)
	}

	return profile, nil
}

func (r *userRepository) GetByEmail(ctx context.Context, email string) (*models.Profile, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, COALESCE(NULLIF(p.email, ''), u.email, ''), p.full_name, p.role, p.approval_status, p.approved_by, p.approved_at, p.created_at
		FROM public.profiles p
		INNER JOIN auth.users u ON u.id = p.id
		WHERE u.email = $1
	`, email)

	profile, err := scanProfile(row)
	if err != nil {
		return nil, fmt.Errorf("get user by email %q: %w", email, err)
	}

	return profile, nil
}

func (r *userRepository) Create(ctx context.Context, profile *models.Profile) (*models.Profile, error) {
	if profile == nil {
		return nil, fmt.Errorf("profile is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.profiles (id, full_name, email, role, approval_status)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE
		SET full_name = EXCLUDED.full_name,
		    email = EXCLUDED.email
		RETURNING id, email, full_name, role, approval_status, approved_by, approved_at, created_at
	`, profile.ID, profile.FullName, profile.Email, coalesceRole(profile.Role), coalesceApproval(profile.ApprovalStatus))

	var created models.Profile
	if err := row.Scan(
		&created.ID,
		&created.Email,
		&created.FullName,
		&created.Role,
		&created.ApprovalStatus,
		&created.ApprovedBy,
		&created.ApprovedAt,
		&created.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("create profile for %q: %w", profile.ID, err)
	}

	return &created, nil
}

func (r *userRepository) UpdateProfile(ctx context.Context, id, fullName string) (*models.Profile, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE public.profiles
		SET full_name = $2
		WHERE id = $1
	`, id, fullName)
	if err != nil {
		return nil, fmt.Errorf("update profile %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return nil, fmt.Errorf("update profile %q: %w", id, pgx.ErrNoRows)
	}

	profile, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("load updated profile %q: %w", id, err)
	}

	return profile, nil
}

func (r *userRepository) UpdateApprovalStatus(ctx context.Context, id, status string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE public.profiles
		SET approval_status = $2,
		    approved_at = CASE WHEN $3::text IN ('approved', 'rejected') THEN NOW() ELSE approved_at END
		WHERE id = $1
	`, id, status, status)
	if err != nil {
		return fmt.Errorf("update approval status for %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("update approval status for %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func (r *userRepository) ListPending(ctx context.Context) ([]*models.Profile, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, COALESCE(NULLIF(p.email, ''), u.email, ''), p.full_name, p.role, p.approval_status, p.approved_by, p.approved_at, p.created_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON u.id = p.id
		WHERE p.approval_status = 'pending'
		ORDER BY p.created_at ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list pending users: %w", err)
	}
	defer rows.Close()

	return collectProfiles(rows)
}

func (r *userRepository) ListAll(ctx context.Context) ([]*models.Profile, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, COALESCE(NULLIF(p.email, ''), u.email, ''), p.full_name, p.role, p.approval_status, p.approved_by, p.approved_at, p.created_at
		FROM public.profiles p
		LEFT JOIN auth.users u ON u.id = p.id
		ORDER BY p.created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list all users: %w", err)
	}
	defer rows.Close()

	return collectProfiles(rows)
}

func collectProfiles(rows pgx.Rows) ([]*models.Profile, error) {
	profiles := make([]*models.Profile, 0)
	for rows.Next() {
		profile, err := scanProfile(rows)
		if err != nil {
			return nil, fmt.Errorf("scan profile: %w", err)
		}

		profiles = append(profiles, profile)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate profiles: %w", err)
	}

	return profiles, nil
}

func scanProfile(s scanner) (*models.Profile, error) {
	var profile models.Profile
	if err := s.Scan(
		&profile.ID,
		&profile.Email,
		&profile.FullName,
		&profile.Role,
		&profile.ApprovalStatus,
		&profile.ApprovedBy,
		&profile.ApprovedAt,
		&profile.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &profile, nil
}

func coalesceRole(role string) string {
	if role == "" {
		return models.RoleUser
	}

	return role
}

func coalesceApproval(status string) string {
	if status == "" {
		return models.ApprovalPending
	}

	return status
}
