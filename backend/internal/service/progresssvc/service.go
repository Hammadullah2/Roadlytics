// Package progresssvc implements read and update operations for job progress.
package progresssvc

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

// ProgressService defines the progress-related operations used by handlers.
type ProgressService interface {
	GetJob(ctx context.Context, userID, jobID string) (*models.Job, error)
	GetJobStatus(ctx context.Context, userID, jobID string) (string, error)
	GetJobProgress(ctx context.Context, userID, jobID string) (int, error)
	ListJobsByRegion(ctx context.Context, userID, regionID string) ([]*models.Job, error)
	UpdateStatus(ctx context.Context, id, status string) error
	UpdateProgress(ctx context.Context, id string, progress int) error
}

// Service handles job status queries and progress tracking.
type Service struct {
	jobs repository.JobRepository
}

// New creates a progress service from a job repository dependency.
func New(jobs repository.JobRepository) ProgressService {
	return &Service{jobs: jobs}
}

// GetJob returns a job if it belongs to the authenticated user.
func (s *Service) GetJob(ctx context.Context, userID, jobID string) (*models.Job, error) {
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get job %q: %w", jobID, err)
	}

	if job.CreatedBy != userID {
		return nil, fmt.Errorf("get job %q for user %q: %w", jobID, userID, pgx.ErrNoRows)
	}

	return job, nil
}

// GetJobStatus returns the current status of a job owned by the authenticated user.
func (s *Service) GetJobStatus(ctx context.Context, userID, jobID string) (string, error) {
	job, err := s.GetJob(ctx, userID, jobID)
	if err != nil {
		return "", err
	}

	return job.Status, nil
}

// GetJobProgress returns the current progress percentage of a job owned by the authenticated user.
func (s *Service) GetJobProgress(ctx context.Context, userID, jobID string) (int, error) {
	job, err := s.GetJob(ctx, userID, jobID)
	if err != nil {
		return 0, err
	}

	return job.Progress, nil
}

// ListJobsByRegion returns jobs in a region that belong to the authenticated user.
func (s *Service) ListJobsByRegion(ctx context.Context, userID, regionID string) ([]*models.Job, error) {
	jobs, err := s.jobs.ListByRegion(ctx, regionID)
	if err != nil {
		return nil, fmt.Errorf("list jobs by region %q: %w", regionID, err)
	}

	filtered := make([]*models.Job, 0, len(jobs))
	for _, job := range jobs {
		if job.CreatedBy == userID {
			filtered = append(filtered, job)
		}
	}

	return filtered, nil
}

// UpdateStatus updates a job status for internal backend workflows.
func (s *Service) UpdateStatus(ctx context.Context, id, status string) error {
	if err := s.jobs.UpdateStatus(ctx, id, status); err != nil {
		return fmt.Errorf("update job status %q: %w", id, err)
	}

	return nil
}

// UpdateProgress updates a job progress percentage for internal backend workflows.
func (s *Service) UpdateProgress(ctx context.Context, id string, progress int) error {
	if err := s.jobs.UpdateProgress(ctx, id, progress); err != nil {
		return fmt.Errorf("update job progress %q: %w", id, err)
	}

	return nil
}
