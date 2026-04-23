// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/progresssvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// JobHandler serves job creation and progress endpoints.
type JobHandler struct {
	ingestion ingestionsvc.IngestionService
	progress  progresssvc.ProgressService
}

// NewJobHandler creates a job handler from ingestion and progress services.
func NewJobHandler(ingestion ingestionsvc.IngestionService, progress progresssvc.ProgressService) *JobHandler {
	return &JobHandler{
		ingestion: ingestion,
		progress:  progress,
	}
}

// Create creates a pending processing job for a region owned by the user.
func (h *JobHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RegionID      string  `json:"region_id"`
		JobType       string  `json:"job_type"`
		StartDate     string  `json:"start_date"`
		EndDate       string  `json:"end_date"`
		MaxCloudCover float64 `json:"max_cloud_cover"`
		ResolutionM   int     `json:"resolution_m"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.RegionID = strings.TrimSpace(req.RegionID)
	req.JobType = strings.TrimSpace(req.JobType)
	if req.RegionID == "" {
		response.Error(w, http.StatusBadRequest, "region_id is required")
		return
	}

	if req.JobType == "" {
		response.Error(w, http.StatusBadRequest, "job_type is required")
		return
	}

	var params *models.JobInferenceParams
	if req.StartDate != "" || req.EndDate != "" {
		resM := req.ResolutionM
		if resM <= 0 {
			resM = 10
		}

		cloudCover := req.MaxCloudCover
		if cloudCover <= 0 {
			cloudCover = 0.15
		}

		params = &models.JobInferenceParams{
			StartDate:     req.StartDate,
			EndDate:       req.EndDate,
			MaxCloudCover: cloudCover,
			ResolutionM:   resM,
		}
	}

	job, err := h.ingestion.CreateJob(r.Context(), middleware.UserIDFromContext(r.Context()), req.RegionID, req.JobType, params)
	if err != nil {
		writeServiceError(w, err, "failed to create job")
		return
	}

	response.JSON(w, http.StatusCreated, job)
}

// CreateForRegion creates a pending processing job for the region referenced in the path.
func (h *JobHandler) CreateForRegion(w http.ResponseWriter, r *http.Request) {
	var req struct {
		JobType string `json:"job_type"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.JobType = strings.TrimSpace(req.JobType)
	if req.JobType == "" {
		response.Error(w, http.StatusBadRequest, "job_type is required")
		return
	}

	job, err := h.ingestion.CreateJob(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
		req.JobType,
		nil,
	)
	if err != nil {
		writeServiceError(w, err, "failed to create job")
		return
	}

	response.JSON(w, http.StatusCreated, job)
}

// Get returns a job by ID for the authenticated user.
func (h *JobHandler) Get(w http.ResponseWriter, r *http.Request) {
	job, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	response.JSON(w, http.StatusOK, job)
}

// GetStatus returns the current job status for the authenticated user.
func (h *JobHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	status, err := h.progress.GetJobStatus(r.Context(), middleware.UserIDFromContext(r.Context()), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load job status")
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{
		"job_id": jobID,
		"status": status,
	})
}

// GetProgress returns the current job progress for the authenticated user.
func (h *JobHandler) GetProgress(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	progress, err := h.progress.GetJobProgress(r.Context(), middleware.UserIDFromContext(r.Context()), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load job progress")
		return
	}

	response.JSON(w, http.StatusOK, map[string]any{
		"job_id":   jobID,
		"progress": progress,
	})
}

// ListByRegion returns jobs for a region owned by the authenticated user.
func (h *JobHandler) ListByRegion(w http.ResponseWriter, r *http.Request) {
	jobs, err := h.progress.ListJobsByRegion(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to list jobs")
		return
	}

	response.JSON(w, http.StatusOK, jobs)
}
