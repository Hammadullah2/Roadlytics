// Package models defines processing job models for the backend.
package models

import (
	"encoding/json"
	"time"
)

// JobStatus enumerates the lifecycle states of a processing job.
const (
	JobStatusPending   = "pending"
	JobStatusRunning   = "running"
	JobStatusCompleted = "completed"
	JobStatusFailed    = "failed"
)

// JobType enumerates the kinds of processing a job can perform.
const (
	JobTypeSegmentation   = "segmentation"
	JobTypeClassification = "classification"
	JobTypeConnectivity   = "connectivity"
	JobTypeFull           = "full"
)

// Job tracks the state of an async processing task dispatched to the AI model.
type Job struct {
	ID           string          `json:"id" db:"id"`
	RegionID     string          `json:"region_id" db:"region_id"`
	CreatedBy    string          `json:"created_by" db:"created_by"`
	JobType      string          `json:"job_type" db:"job_type"`
	Status       string          `json:"status" db:"status"`
	Progress     int             `json:"progress" db:"progress"`
	ErrorMessage *string         `json:"error_message,omitempty" db:"error_message"`
	CreatedAt    time.Time       `json:"created_at" db:"created_at"`
	StartedAt    *time.Time      `json:"started_at,omitempty" db:"started_at"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty" db:"completed_at"`
	ResultRefs   json.RawMessage `json:"result_refs,omitempty" db:"result_refs"`
}

// IsTerminal returns true if the job is in a final state.
func (j *Job) IsTerminal() bool {
	return j.Status == JobStatusCompleted || j.Status == JobStatusFailed
}

// JobResultRefs is stored as JSONB in result_refs and holds inference params, outputs, stats, and satellite scene info.
type JobResultRefs struct {
	InferenceJobID string              `json:"inference_job_id,omitempty"`
	Params         *JobInferenceParams `json:"params,omitempty"`
	Downloads      *JobDownloads       `json:"downloads,omitempty"`
	Stats          *JobStats           `json:"stats,omitempty"`
	SceneID        string              `json:"scene_id,omitempty"`
	SceneDate      string              `json:"scene_date,omitempty"`
}

// JobInferenceParams holds the Planet/Sentinel-2 parameters passed at job creation.
type JobInferenceParams struct {
	StartDate     string  `json:"start_date"`
	EndDate       string  `json:"end_date"`
	MaxCloudCover float64 `json:"max_cloud_cover"`
	ResolutionM   int     `json:"resolution_m"`
}

// JobDownloads holds the file_key → path mapping returned by the inference server.
// Values are paths on the inference server's filesystem — they are not browser-accessible URLs.
// To retrieve the actual bytes, call GET {INFERENCE_SERVER_URL}/api/jobs/{inference_job_id}/download/{file_key}.
type JobDownloads struct {
	NormalisedTif      string `json:"normalised_tif,omitempty"`
	SegMaskTif         string `json:"seg_mask_tif,omitempty"`
	RoadsRawShp        string `json:"roads_raw_shp,omitempty"`
	RoadsClassifiedShp string `json:"roads_classified_shp,omitempty"`
	RoadsClassifiedCsv string `json:"roads_classified_csv,omitempty"`
	GraphGraphml       string `json:"graph_graphml,omitempty"`
	GraphGeoJSON       string `json:"graph_geojson,omitempty"`
	ComponentsCsv      string `json:"components_csv,omitempty"`
	ReportPDF          string `json:"report_pdf,omitempty"`
	ReportZip          string `json:"report_zip,omitempty"`
}

// JobStats mirrors the stats dict produced by the inference pipeline's build_graph stage.
type JobStats struct {
	TotalNodes         int     `json:"total_nodes"`
	TotalEdges         int     `json:"total_edges"`
	TotalComponents    int     `json:"total_components"`
	IsolatedComponents int     `json:"isolated_components"`
	TotalRoadKm        float64 `json:"total_road_km"`
	LargestNetworkKm   float64 `json:"largest_network_km"`
}
