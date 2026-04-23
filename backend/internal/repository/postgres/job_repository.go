// Package postgres provides pgx-backed repository implementations.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

type jobRepository struct {
	pool *pgxpool.Pool
}

// NewJobRepository creates a PostgreSQL-backed job repository.
func NewJobRepository(pool *pgxpool.Pool) repository.JobRepository {
	return &jobRepository{pool: pool}
}

func (r *jobRepository) Create(ctx context.Context, job *models.Job) (*models.Job, error) {
	if job == nil {
		return nil, fmt.Errorf("job is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.jobs (region_id, created_by, job_type, status, progress, result_refs)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, region_id, created_by, job_type, status, progress, error_message, created_at, started_at, completed_at, result_refs
	`, job.RegionID, job.CreatedBy, job.JobType, jobStatus(job.Status), defaultProgress(job.Progress), job.ResultRefs)

	created, err := scanJob(row)
	if err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	return created, nil
}

func (r *jobRepository) GetByID(ctx context.Context, id string) (*models.Job, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, region_id, created_by, job_type, status, progress, error_message, created_at, started_at, completed_at, result_refs
		FROM public.jobs
		WHERE id = $1
	`, id)

	job, err := scanJob(row)
	if err != nil {
		return nil, fmt.Errorf("get job %q: %w", id, err)
	}

	return job, nil
}

func (r *jobRepository) ListByRegion(ctx context.Context, regionID string) ([]*models.Job, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, region_id, created_by, job_type, status, progress, error_message, created_at, started_at, completed_at, result_refs
		FROM public.jobs
		WHERE region_id = $1
		ORDER BY created_at DESC
	`, regionID)
	if err != nil {
		return nil, fmt.Errorf("list jobs for region %q: %w", regionID, err)
	}
	defer rows.Close()

	return collectJobs(rows)
}

func (r *jobRepository) UpdateStatus(ctx context.Context, id, status string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE public.jobs
		SET status = $2::text,
		    started_at = CASE WHEN $2::text = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
		    completed_at = CASE WHEN $2::text IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
		    progress = CASE WHEN $2::text = 'completed' THEN 100 ELSE progress END
		WHERE id = $1
	`, id, status)
	if err != nil {
		return fmt.Errorf("update job status %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("update job status %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func (r *jobRepository) UpdateProgress(ctx context.Context, id string, progress int) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE public.jobs
		SET progress = $2
		WHERE id = $1
	`, id, progress)
	if err != nil {
		return fmt.Errorf("update job progress %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("update job progress %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func (r *jobRepository) UpdateResultRefs(ctx context.Context, id string, refs *models.JobResultRefs) error {
	payload, err := json.Marshal(refs)
	if err != nil {
		return fmt.Errorf("marshal result refs for job %q: %w", id, err)
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE public.jobs
		SET result_refs = $2
		WHERE id = $1
	`, id, payload)
	if err != nil {
		return fmt.Errorf("update result refs for job %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("update result refs for job %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func (r *jobRepository) ListPending(ctx context.Context) ([]*models.Job, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, region_id, created_by, job_type, status, progress, error_message, created_at, started_at, completed_at, result_refs
		FROM public.jobs
		WHERE status = 'pending'
		ORDER BY created_at ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list pending jobs: %w", err)
	}
	defer rows.Close()

	return collectJobs(rows)
}

func (r *jobRepository) ListRunning(ctx context.Context) ([]*models.Job, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, region_id, created_by, job_type, status, progress, error_message, created_at, started_at, completed_at, result_refs
		FROM public.jobs
		WHERE status = 'running'
		ORDER BY started_at ASC NULLS LAST
	`)
	if err != nil {
		return nil, fmt.Errorf("list running jobs: %w", err)
	}
	defer rows.Close()

	return collectJobs(rows)
}

func collectJobs(rows pgx.Rows) ([]*models.Job, error) {
	jobs := make([]*models.Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}

		jobs = append(jobs, job)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate jobs: %w", err)
	}

	return jobs, nil
}

func scanJob(s scanner) (*models.Job, error) {
	var job models.Job
	if err := s.Scan(
		&job.ID,
		&job.RegionID,
		&job.CreatedBy,
		&job.JobType,
		&job.Status,
		&job.Progress,
		&job.ErrorMessage,
		&job.CreatedAt,
		&job.StartedAt,
		&job.CompletedAt,
		&job.ResultRefs,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &job, nil
}

func jobStatus(status string) string {
	if status == "" {
		return models.JobStatusPending
	}

	return status
}

func defaultProgress(progress int) int {
	if progress < 0 {
		return 0
	}

	return progress
}
