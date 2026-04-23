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

type reportRepository struct {
	pool *pgxpool.Pool
}

// NewReportRepository creates a PostgreSQL-backed report repository.
func NewReportRepository(pool *pgxpool.Pool) repository.ReportRepository {
	return &reportRepository{pool: pool}
}

func (r *reportRepository) Create(ctx context.Context, report *models.Report) (*models.Report, error) {
	if report == nil {
		return nil, fmt.Errorf("report is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.reports (job_id, report_type, file_path)
		VALUES ($1, $2, $3)
		RETURNING id, job_id, report_type, file_path, created_at
	`, report.JobID, report.ReportType, report.FilePath)

	created, err := scanReport(row)
	if err != nil {
		return nil, fmt.Errorf("create report: %w", err)
	}

	return created, nil
}

func (r *reportRepository) GetByID(ctx context.Context, id string) (*models.Report, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, job_id, report_type, file_path, created_at
		FROM public.reports
		WHERE id = $1
	`, id)

	report, err := scanReport(row)
	if err != nil {
		return nil, fmt.Errorf("get report %q: %w", id, err)
	}

	return report, nil
}

func (r *reportRepository) ListByJob(ctx context.Context, jobID string) ([]*models.Report, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, job_id, report_type, file_path, created_at
		FROM public.reports
		WHERE job_id = $1
		ORDER BY created_at DESC
	`, jobID)
	if err != nil {
		return nil, fmt.Errorf("list reports for job %q: %w", jobID, err)
	}
	defer rows.Close()

	reports := make([]*models.Report, 0)
	for rows.Next() {
		report, scanErr := scanReport(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan report: %w", scanErr)
		}

		reports = append(reports, report)
	}

	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate reports: %w", rows.Err())
	}

	return reports, nil
}

func (r *reportRepository) ListByUser(ctx context.Context, userID string) ([]*models.Report, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT rep.id, rep.job_id, rep.report_type, rep.file_path, rep.created_at
		FROM public.reports rep
		JOIN public.jobs j ON j.id = rep.job_id
		WHERE j.created_by = $1
		ORDER BY rep.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list reports for user %q: %w", userID, err)
	}
	defer rows.Close()

	reports := make([]*models.Report, 0)
	for rows.Next() {
		report, scanErr := scanReport(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("scan report: %w", scanErr)
		}

		reports = append(reports, report)
	}

	if rows.Err() != nil {
		return nil, fmt.Errorf("iterate reports: %w", rows.Err())
	}

	return reports, nil
}

func (r *reportRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM public.reports
		WHERE id = $1
	`, id)
	if err != nil {
		return fmt.Errorf("delete report %q: %w", id, err)
	}

	if tag.RowsAffected() == 0 {
		return fmt.Errorf("delete report %q: %w", id, pgx.ErrNoRows)
	}

	return nil
}

func scanReport(s scanner) (*models.Report, error) {
	var report models.Report
	if err := s.Scan(
		&report.ID,
		&report.JobID,
		&report.ReportType,
		&report.FilePath,
		&report.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &report, nil
}
