// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/orchestrator"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// CallbackHandler receives internal ML model progress updates and forwards them into the orchestrator.
type CallbackHandler struct {
	orchestrator *orchestrator.Orchestrator
}

// NewCallbackHandler creates a callback handler backed by the orchestrator queues.
func NewCallbackHandler(orch *orchestrator.Orchestrator) *CallbackHandler {
	return &CallbackHandler{orchestrator: orch}
}

// UpdateJobProgress queues a job progress update received from the internal model callback.
func (h *CallbackHandler) UpdateJobProgress(w http.ResponseWriter, r *http.Request) {
	if h.orchestrator == nil {
		response.Error(w, http.StatusInternalServerError, "orchestrator is not configured")
		return
	}

	jobID := strings.TrimSpace(chi.URLParam(r, "id"))
	if jobID == "" {
		response.Error(w, http.StatusBadRequest, "job id is required")
		return
	}

	var req struct {
		Progress  int                 `json:"progress"`
		Stage     string              `json:"stage"`
		Status    string              `json:"status"`
		Downloads *models.JobDownloads `json:"downloads,omitempty"`
		Stats     *models.JobStats     `json:"stats,omitempty"`
		Error     string              `json:"error,omitempty"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Stage = strings.TrimSpace(req.Stage)
	req.Status = strings.TrimSpace(req.Status)

	if req.Progress < 0 || req.Progress > 100 {
		response.Error(w, http.StatusBadRequest, "progress must be between 0 and 100")
		return
	}

	validStages := map[string]bool{
		models.JobTypeSegmentation:   true,
		models.JobTypeClassification: true,
		models.JobTypeConnectivity:   true,
		"fetch":      true,
		"preprocess": true,
		"segment":    true,
		"classify":   true,
		"graph":      true,
		"report":     true,
	}
	if req.Stage != "" && !validStages[req.Stage] {
		response.Error(w, http.StatusBadRequest, "unknown stage value")
		return
	}

	if req.Status != models.JobStatusPending &&
		req.Status != models.JobStatusRunning &&
		req.Status != models.JobStatusCompleted &&
		req.Status != models.JobStatusFailed {
		response.Error(w, http.StatusBadRequest, "status must be pending, running, completed, or failed")
		return
	}

	if err := h.orchestrator.ApplyJobUpdate(r.Context(), orchestrator.JobUpdateRequest{
		JobID:     jobID,
		Progress:  req.Progress,
		Status:    req.Status,
		Stage:     req.Stage,
		Downloads: req.Downloads,
		Stats:     req.Stats,
	}); err != nil {
		writeServiceError(w, err, "failed to update job progress")
		return
	}

	writeSuccess(w, http.StatusAccepted, map[string]any{
		"job_id":   jobID,
		"progress": req.Progress,
		"stage":    req.Stage,
		"status":   req.Status,
	}, "job progress updated successfully")
}
