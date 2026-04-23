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

type projectRepository struct {
	pool *pgxpool.Pool
}

// NewProjectRepository creates a PostgreSQL-backed project repository.
func NewProjectRepository(pool *pgxpool.Pool) repository.ProjectRepository {
	return &projectRepository{pool: pool}
}

func (r *projectRepository) Create(ctx context.Context, project *models.Project) (*models.Project, error) {
	if project == nil {
		return nil, fmt.Errorf("project is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.projects (owner_id, name, description, status)
		VALUES ($1, $2, $3, $4)
		RETURNING id, owner_id, name, description, status, created_at, updated_at
	`, project.OwnerID, project.Name, project.Description, projectStatus(project.Status))

	created, err := scanProject(row)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	return created, nil
}

func (r *projectRepository) GetByID(ctx context.Context, id string) (*models.Project, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, owner_id, name, description, status, created_at, updated_at
		FROM public.projects
		WHERE id = $1
	`, id)

	project, err := scanProject(row)
	if err != nil {
		return nil, fmt.Errorf("get project %q: %w", id, err)
	}

	return project, nil
}

func (r *projectRepository) ListByOwner(ctx context.Context, ownerID string) ([]*models.Project, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, owner_id, name, description, status, created_at, updated_at
		FROM public.projects
		WHERE owner_id = $1
		ORDER BY created_at DESC
	`, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list projects for owner %q: %w", ownerID, err)
	}
	defer rows.Close()

	projects := make([]*models.Project, 0)
	for rows.Next() {
		project, err := scanProject(rows)
		if err != nil {
			return nil, fmt.Errorf("scan project: %w", err)
		}

		projects = append(projects, project)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate projects: %w", err)
	}

	return projects, nil
}

func (r *projectRepository) Update(ctx context.Context, project *models.Project) (*models.Project, error) {
	if project == nil {
		return nil, fmt.Errorf("project is required")
	}

	row := r.pool.QueryRow(ctx, `
		UPDATE public.projects
		SET name = $2,
		    description = $3,
		    status = $4,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, owner_id, name, description, status, created_at, updated_at
	`, project.ID, project.Name, project.Description, projectStatus(project.Status))

	updated, err := scanProject(row)
	if err != nil {
		return nil, fmt.Errorf("update project %q: %w", project.ID, err)
	}

	return updated, nil
}

func (r *projectRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM public.projects
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete project %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("delete project %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func scanProject(s scanner) (*models.Project, error) {
	var project models.Project
	if err := s.Scan(
		&project.ID,
		&project.OwnerID,
		&project.Name,
		&project.Description,
		&project.Status,
		&project.CreatedAt,
		&project.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &project, nil
}

func projectStatus(status string) string {
	if status == "" {
		return models.ProjectStatusActive
	}

	return status
}
