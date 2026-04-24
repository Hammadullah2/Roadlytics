// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// CallbackHandler receives signed progress/completion updates from the inference
// server (running on the VPS) and persists them to the database.
// The inference server already writes progress directly to Supabase via
// supabase_bridge.py, so this callback is primarily for any server-side
// post-processing that must run in the backend (e.g. inserting report rows).
type CallbackHandler struct {
	jobs repository.JobRepository
}

// NewCallbackHandler creates a callback handler with direct database access.
func NewCallbackHandler(jobs repository.JobRepository) *CallbackHandler {
	return &CallbackHandler{jobs: jobs}
}

// UpdateJobProgress processes a signed progress/completion event from the inference server.
func (h *CallbackHandler) UpdateJobProgress(w http.ResponseWriter, r *http.Request) {
	jobID := strings.TrimSpace(chi.URLParam(r, "id"))
	if jobID == "" {
		response.Error(w, http.StatusBadRequest, "job id is required")
		return
	}

	var req struct {
		Progress  int                  `json:"progress"`
		Stage     string               `json:"stage"`
		Status    string               `json:"status"`
		Downloads *models.JobDownloads `json:"downloads,omitempty"`
		Stats     *models.JobStats     `json:"stats,omitempty"`
		Error     string               `json:"error,omitempty"`
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

	validStatuses := map[string]bool{
		models.JobStatusPending:   true,
		models.JobStatusRunning:   true,
		models.JobStatusCompleted: true,
		models.JobStatusFailed:    true,
	}
	if !validStatuses[req.Status] {
		response.Error(w, http.StatusBadRequest, "status must be pending, running, completed, or failed")
		return
	}

	ctx := r.Context()

	if req.Status != "" {
		if err := h.jobs.UpdateStatus(ctx, jobID, req.Status); err != nil {
			writeServiceError(w, err, "failed to update job status")
			return
		}
	}

	clamped := req.Progress
	if clamped < 0 {
		clamped = 0
	}
	if clamped > 100 {
		clamped = 100
	}
	if err := h.jobs.UpdateProgress(ctx, jobID, clamped); err != nil {
		writeServiceError(w, err, "failed to update job progress")
		return
	}

	if req.Downloads != nil || req.Stats != nil {
		job, err := h.jobs.GetByID(ctx, jobID)
		if err == nil {
			var refs models.JobResultRefs
			if len(job.ResultRefs) > 0 {
				_ = json.Unmarshal(job.ResultRefs, &refs)
			}
			if req.Downloads != nil {
				if refs.Downloads == nil {
					refs.Downloads = req.Downloads
				} else {
					if req.Downloads.NormalisedTif != "" { refs.Downloads.NormalisedTif = req.Downloads.NormalisedTif }
					if req.Downloads.SegMaskTif != "" { refs.Downloads.SegMaskTif = req.Downloads.SegMaskTif }
					if req.Downloads.CombinedTif != "" { refs.Downloads.CombinedTif = req.Downloads.CombinedTif }
					if req.Downloads.ComponentMapTif != "" { refs.Downloads.ComponentMapTif = req.Downloads.ComponentMapTif }
					if req.Downloads.BetweennessTif != "" { refs.Downloads.BetweennessTif = req.Downloads.BetweennessTif }
					if req.Downloads.ComponentsCsv != "" { refs.Downloads.ComponentsCsv = req.Downloads.ComponentsCsv }
					if req.Downloads.ReportPDF != "" { refs.Downloads.ReportPDF = req.Downloads.ReportPDF }
					if req.Downloads.ReportZip != "" { refs.Downloads.ReportZip = req.Downloads.ReportZip }
				}
			}
			if req.Stats != nil {
				refs.Stats = req.Stats
			}
			if err := h.jobs.UpdateResultRefs(ctx, jobID, &refs); err != nil {
				// Non-fatal: supabase_bridge already wrote the result_refs directly.
				_ = err
			}
		}
	}

	response.JSON(w, http.StatusAccepted, map[string]any{
		"job_id":   jobID,
		"progress": req.Progress,
		"stage":    req.Stage,
		"status":   req.Status,
	})
}

