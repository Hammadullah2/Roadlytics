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

type resultRepository struct {
	pool *pgxpool.Pool
}

// NewResultRepository creates a PostgreSQL-backed result repository.
func NewResultRepository(pool *pgxpool.Pool) repository.ResultRepository {
	return &resultRepository{pool: pool}
}

func (r *resultRepository) SaveSegmentation(ctx context.Context, result *models.SegmentationResult) (*models.SegmentationResult, error) {
	if result == nil {
		return nil, fmt.Errorf("segmentation result is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.segmentation_results (job_id, geojson_data, mask_path, pixel_count)
		VALUES ($1, $2, $3, $4)
		RETURNING id, job_id, geojson_data, mask_path, pixel_count, created_at
	`, result.JobID, result.GeoJSONData, result.MaskPath, result.PixelCount)

	saved, err := scanSegmentation(row)
	if err != nil {
		return nil, fmt.Errorf("save segmentation result for job %q: %w", result.JobID, err)
	}

	return saved, nil
}

func (r *resultRepository) SaveClassification(ctx context.Context, result *models.ClassificationResult) (*models.ClassificationResult, error) {
	if result == nil {
		return nil, fmt.Errorf("classification result is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.classification_results (segmentation_id, patch_id, road_label, confidence, geometry)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, segmentation_id, patch_id, road_label, confidence, geometry, created_at
	`, result.SegmentationID, result.PatchID, result.RoadLabel, result.Confidence, result.Geometry)

	saved, err := scanClassification(row)
	if err != nil {
		return nil, fmt.Errorf("save classification result for segmentation %q: %w", result.SegmentationID, err)
	}

	return saved, nil
}

func (r *resultRepository) SaveConnectivityGraph(ctx context.Context, result *models.ConnectivityGraph) (*models.ConnectivityGraph, error) {
	if result == nil {
		return nil, fmt.Errorf("connectivity graph is required")
	}

	row := r.pool.QueryRow(ctx, `
		INSERT INTO public.connectivity_graphs (job_id, graph_data, metrics)
		VALUES ($1, $2, $3)
		RETURNING id, job_id, graph_data, metrics, created_at
	`, result.JobID, result.GraphData, result.Metrics)

	saved, err := scanConnectivity(row)
	if err != nil {
		return nil, fmt.Errorf("save connectivity graph for job %q: %w", result.JobID, err)
	}

	return saved, nil
}

func (r *resultRepository) GetResultsByJob(ctx context.Context, jobID string) (*models.JobResults, error) {
	results := &models.JobResults{
		JobID:          jobID,
		Classification: make([]*models.ClassificationResult, 0),
	}

	segRow := r.pool.QueryRow(ctx, `
		SELECT id, job_id, geojson_data, mask_path, pixel_count, created_at
		FROM public.segmentation_results
		WHERE job_id = $1
	`, jobID)

	segmentation, err := scanSegmentation(segRow)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get segmentation results for job %q: %w", jobID, err)
	}

	if err == nil {
		results.Segmentation = segmentation

		rows, clsErr := r.pool.Query(ctx, `
			SELECT id, segmentation_id, patch_id, road_label, confidence, geometry, created_at
			FROM public.classification_results
			WHERE segmentation_id = $1
			ORDER BY created_at ASC
		`, segmentation.ID)
		if clsErr != nil {
			return nil, fmt.Errorf("list classification results for job %q: %w", jobID, clsErr)
		}
		defer rows.Close()

		for rows.Next() {
			classification, scanErr := scanClassification(rows)
			if scanErr != nil {
				return nil, fmt.Errorf("scan classification result for job %q: %w", jobID, scanErr)
			}

			results.Classification = append(results.Classification, classification)
		}

		if rows.Err() != nil {
			return nil, fmt.Errorf("iterate classification results for job %q: %w", jobID, rows.Err())
		}
	}

	connectivityRow := r.pool.QueryRow(ctx, `
		SELECT id, job_id, graph_data, metrics, created_at
		FROM public.connectivity_graphs
		WHERE job_id = $1
	`, jobID)

	connectivity, err := scanConnectivity(connectivityRow)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("get connectivity graph for job %q: %w", jobID, err)
	}

	if err == nil {
		results.Connectivity = connectivity
	}

	return results, nil
}

func scanSegmentation(s scanner) (*models.SegmentationResult, error) {
	var result models.SegmentationResult
	if err := s.Scan(
		&result.ID,
		&result.JobID,
		&result.GeoJSONData,
		&result.MaskPath,
		&result.PixelCount,
		&result.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &result, nil
}

func scanClassification(s scanner) (*models.ClassificationResult, error) {
	var result models.ClassificationResult
	if err := s.Scan(
		&result.ID,
		&result.SegmentationID,
		&result.PatchID,
		&result.RoadLabel,
		&result.Confidence,
		&result.Geometry,
		&result.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &result, nil
}

func scanConnectivity(s scanner) (*models.ConnectivityGraph, error) {
	var result models.ConnectivityGraph
	if err := s.Scan(
		&result.ID,
		&result.JobID,
		&result.GraphData,
		&result.Metrics,
		&result.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}

		return nil, err
	}

	return &result, nil
}
