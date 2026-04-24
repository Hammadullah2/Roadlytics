// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/dispatch"
	"github.com/Hammadullah2/Roadlytics/backend/lib/middleware"
	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/ingestionsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/progresssvc"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// createJobResponse wraps a Job with the direct upload URL the client should use.
type createJobResponse struct {
	*models.Job
	UploadURL string `json:"upload_url,omitempty"`
}

// JobHandler serves job creation and progress endpoints.
type JobHandler struct {
	ingestion          ingestionsvc.IngestionService
	progress           progresssvc.ProgressService
	dispatcher         *dispatch.Dispatcher
	inferenceUploadURL string
}

// NewJobHandler creates a job handler.
// inferenceUploadURL is the full URL of the inference server's upload endpoint
// (e.g. https://inference.example.com/api/jobs/upload-and-run). The frontend
// uploads GeoTIFF files directly to this URL, bypassing Vercel's 4.5 MB limit.
// Pass an empty string if the inference server is not configured.
func NewJobHandler(
	ingestion          ingestionsvc.IngestionService,
	progress           progresssvc.ProgressService,
	dispatcher         *dispatch.Dispatcher,
	inferenceUploadURL string,
) *JobHandler {
	return &JobHandler{
		ingestion:          ingestion,
		progress:           progress,
		dispatcher:         dispatcher,
		inferenceUploadURL: inferenceUploadURL,
	}
}

// Create creates a pending job record and returns an upload_url the client must
// POST the GeoTIFF to directly. The file never passes through this server.
func (h *JobHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RegionID string `json:"region_id"`
		JobType  string `json:"job_type"`
		SegModel string `json:"seg_model"`
		ClfModel string `json:"clf_model"`
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

	job, err := h.ingestion.CreateJob(r.Context(), middleware.UserIDFromContext(r.Context()), req.RegionID, req.JobType)
	if err != nil {
		writeServiceError(w, err, "failed to create job")
		return
	}

	response.JSON(w, http.StatusCreated, createJobResponse{
		Job:       job,
		UploadURL: h.inferenceUploadURL,
	})
}

// CreateForRegion creates a pending processing job for the region in the path parameter.
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
	)
	if err != nil {
		writeServiceError(w, err, "failed to create job")
		return
	}

	response.JSON(w, http.StatusCreated, createJobResponse{
		Job:       job,
		UploadURL: h.inferenceUploadURL,
	})
}

// dispatchJob sends the job to the inference server without model overrides.
func (h *JobHandler) dispatchJob(r *http.Request, jobID string, tifData []byte) {
	h.dispatchJobWithModels(r, jobID, tifData, "", "")
}

// dispatchJobWithModels sends the job to the inference server with optional model selections.
func (h *JobHandler) dispatchJobWithModels(r *http.Request, jobID string, tifData []byte, segModel, clfModel string) {
	if h.dispatcher == nil {
		return
	}
	if err := h.dispatcher.Dispatch(r.Context(), jobID, tifData, segModel, clfModel); err != nil {
		_ = err
	}
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
