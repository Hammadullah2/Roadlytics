// Package evaluationsvc implements read operations for model evaluation outputs.
package evaluationsvc

import (
	"context"
	"fmt"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

// EvaluationService defines the result retrieval operations used by handlers.
type EvaluationService interface {
	GetSegmentationResults(ctx context.Context, jobID string) (*models.SegmentationResult, error)
	GetClassificationResults(ctx context.Context, jobID string) ([]*models.ClassificationResult, error)
	GetConnectivityGraph(ctx context.Context, jobID string) (*models.ConnectivityGraph, error)
	GetJobResults(ctx context.Context, jobID string) (*models.JobResults, error)
}

// Service handles retrieval of model pipeline results.
type Service struct {
	results repository.ResultRepository
}

// New creates an evaluation service from a result repository dependency.
func New(results repository.ResultRepository) EvaluationService {
	return &Service{results: results}
}

// GetSegmentationResults returns segmentation output for a job.
func (s *Service) GetSegmentationResults(ctx context.Context, jobID string) (*models.SegmentationResult, error) {
	results, err := s.results.GetResultsByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get segmentation results for job %q: %w", jobID, err)
	}

	return results.Segmentation, nil
}

// GetClassificationResults returns classification outputs for a job.
func (s *Service) GetClassificationResults(ctx context.Context, jobID string) ([]*models.ClassificationResult, error) {
	results, err := s.results.GetResultsByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get classification results for job %q: %w", jobID, err)
	}

	return results.Classification, nil
}

// GetConnectivityGraph returns connectivity graph output for a job.
func (s *Service) GetConnectivityGraph(ctx context.Context, jobID string) (*models.ConnectivityGraph, error) {
	results, err := s.results.GetResultsByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get connectivity graph for job %q: %w", jobID, err)
	}

	return results.Connectivity, nil
}

// GetJobResults returns all available result types for a job.
func (s *Service) GetJobResults(ctx context.Context, jobID string) (*models.JobResults, error) {
	results, err := s.results.GetResultsByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get job results for job %q: %w", jobID, err)
	}

	return results, nil
}
