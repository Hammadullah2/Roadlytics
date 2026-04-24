// Package postgres provides pgx-backed repository implementations.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
)

type regionRepository struct {
	pool *pgxpool.Pool
}

// NewRegionRepository creates a PostgreSQL-backed region repository.
func NewRegionRepository(pool *pgxpool.Pool) repository.RegionRepository {
	return &regionRepository{pool: pool}
}

func (r *regionRepository) Create(ctx context.Context, region *models.Region) (*models.Region, error) {
	if region == nil {
		return nil, fmt.Errorf("region is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.regions (project_id, name, polygon)
		VALUES ($1, $2, $3)
		RETURNING id, project_id, name, polygon, created_at
	`, region.ProjectID, region.Name, region.Polygon)

	created, err := scanRegion(row)
	if err != nil {
		return nil, fmt.Errorf("create region: %w", err)
	}

	return created, nil
}

func (r *regionRepository) GetByID(ctx context.Context, id string) (*models.Region, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, project_id, name, polygon, created_at
		FROM public.regions
		WHERE id = $1
	`, id)

	region, err := scanRegion(row)
	if err != nil {
		return nil, fmt.Errorf("get region %q: %w", id, err)
	}

	return region, nil
}

func (r *regionRepository) ListByProject(ctx context.Context, projectID string) ([]*models.Region, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, project_id, name, polygon, created_at
		FROM public.regions
		WHERE project_id = $1
		ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list regions for project %q: %w", projectID, err)
	}
	defer rows.Close()

	regions := make([]*models.Region, 0)
	for rows.Next() {
		region, err := scanRegion(rows)
		if err != nil {
			return nil, fmt.Errorf("scan region: %w", err)
		}

		regions = append(regions, region)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate regions: %w", err)
	}

	return regions, nil
}

func (r *regionRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM public.regions
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete region %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("delete region %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func scanRegion(s scanner) (*models.Region, error) {
	var region models.Region
	if err := s.Scan(
		&region.ID,
		&region.ProjectID,
		&region.Name,
		&region.Polygon,
		&region.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &region, nil
}
