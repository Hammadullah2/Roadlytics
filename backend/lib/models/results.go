// Package models defines storage, results, and reporting models for the backend.
package models

import (
	"encoding/json"
	"time"
)

// SatelliteUpload tracks a user-submitted GeoTIFF file stored in Supabase Storage.
type SatelliteUpload struct {
	ID            string    `json:"id" db:"id"`
	RegionID      string    `json:"region_id" db:"region_id"`
	UploadedBy    string    `json:"uploaded_by" db:"uploaded_by"`
	FilePath      string    `json:"file_path" db:"file_path"`
	FileSizeBytes int64     `json:"file_size_bytes" db:"file_size_bytes"`
	OriginalName  string    `json:"original_name" db:"original_name"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// Image tracks satellite imagery stored in Supabase Storage.
type Image struct {
	ID            string    `json:"id" db:"id"`
	RegionID      string    `json:"region_id" db:"region_id"`
	Source        string    `json:"source" db:"source"`
	FilePath      string    `json:"file_path" db:"file_path"`
	CapturedAt    time.Time `json:"captured_at" db:"captured_at"`
	CloudCoverage float64   `json:"cloud_coverage" db:"cloud_coverage"`
	UploadedBy    string    `json:"uploaded_by" db:"uploaded_by"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// SegmentationResult stores the output of road segmentation.
type SegmentationResult struct {
	ID          string          `json:"id" db:"id"`
	JobID       string          `json:"job_id" db:"job_id"`
	MaskPath    string          `json:"mask_path" db:"mask_path"`
	PixelCount  int             `json:"pixel_count" db:"pixel_count"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
}

// ClassificationResult stores the condition label for a single road segment.
type ClassificationResult struct {
	ID             string          `json:"id" db:"id"`
	SegmentationID string          `json:"segmentation_id" db:"segmentation_id"`
	PatchID        string          `json:"patch_id" db:"patch_id"`
	RoadLabel      string          `json:"road_label" db:"road_label"`
	Confidence     float64         `json:"confidence" db:"confidence"`
	CreatedAt      time.Time       `json:"created_at" db:"created_at"`
}

// RoadLabel constants for classification output.
const (
	RoadLabelGood    = "Good"
	RoadLabelDamaged = "Damaged"
	RoadLabelUnpaved = "Unpaved"
)

// ConnectivityGraph stores the graph analysis output as JSON.
type ConnectivityGraph struct {
	ID        string          `json:"id" db:"id"`
	JobID     string          `json:"job_id" db:"job_id"`
	Metrics   json.RawMessage `json:"metrics" db:"metrics"`
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
}

// Report stores a generated report file reference in Supabase Storage.
type Report struct {
	ID         string    `json:"id" db:"id"`
	JobID      string    `json:"job_id" db:"job_id"`
	ReportType string    `json:"report_type" db:"report_type"`
	FilePath   string    `json:"file_path" db:"file_path"`
	SignedURL  string    `json:"signed_url,omitempty" db:"-"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// JobResults aggregates all available model outputs for a job.
type JobResults struct {
	JobID          string                  `json:"job_id"`
	Segmentation   *SegmentationResult     `json:"segmentation"`
	Classification []*ClassificationResult `json:"classification"`
	Connectivity   *ConnectivityGraph      `json:"connectivity"`
}

// LogEntry records system events for auditing.
type LogEntry struct {
	ID        string          `json:"id" db:"id"`
	UserID    *string         `json:"user_id,omitempty" db:"user_id"`
	EventType string          `json:"event_type" db:"event_type"`
	Message   string          `json:"message" db:"message"`
	Metadata  json.RawMessage `json:"metadata" db:"metadata"`
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
}
