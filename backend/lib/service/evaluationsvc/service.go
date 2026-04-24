// Package evaluationsvc implements read operations for model evaluation outputs.
package evaluationsvc

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
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
	jobs repository.JobRepository
}

// New creates an evaluation service from a job repository dependency.
func New(jobs repository.JobRepository) EvaluationService {
	return &Service{jobs: jobs}
}

// GetSegmentationResults returns segmentation output for a job.
func (s *Service) GetSegmentationResults(ctx context.Context, jobID string) (*models.SegmentationResult, error) {
	results, err := s.GetJobResults(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get segmentation results for job %q: %w", jobID, err)
	}

	return results.Segmentation, nil
}

// GetClassificationResults returns classification outputs for a job.
func (s *Service) GetClassificationResults(ctx context.Context, jobID string) ([]*models.ClassificationResult, error) {
	results, err := s.GetJobResults(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get classification results for job %q: %w", jobID, err)
	}

	return results.Classification, nil
}

// GetConnectivityGraph returns connectivity graph output for a job.
func (s *Service) GetConnectivityGraph(ctx context.Context, jobID string) (*models.ConnectivityGraph, error) {
	results, err := s.GetJobResults(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get connectivity graph for job %q: %w", jobID, err)
	}

	return results.Connectivity, nil
}

// GetJobResults returns all available result types for a job.
func (s *Service) GetJobResults(ctx context.Context, jobID string) (*models.JobResults, error) {
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get job %q: %w", jobID, err)
	}

	results := &models.JobResults{
		JobID:          jobID,
		Classification: make([]*models.ClassificationResult, 0),
	}

	if job.ResultRefs == nil {
		return results, nil
	}

	var refs models.JobResultRefs
	if err := json.Unmarshal(job.ResultRefs, &refs); err != nil {
		return nil, fmt.Errorf("parse result refs for job %q: %w", jobID, err)
	}

	if refs.Downloads != nil {
		if refs.Downloads.SegMaskTif != "" {
			results.Segmentation = &models.SegmentationResult{
				JobID:    jobID,
				MaskPath: refs.Downloads.SegMaskTif,
			}
		}

		if refs.Downloads.ComponentMapTif != "" {
			var metrics json.RawMessage
			if refs.Stats != nil {
				statsBytes, _ := json.Marshal(refs.Stats)
				metrics = json.RawMessage(statsBytes)
			}

			results.Connectivity = &models.ConnectivityGraph{
				JobID:   jobID,
				Metrics: metrics,
			}
		}
	}

	return results, nil
}
