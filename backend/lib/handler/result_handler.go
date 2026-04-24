// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/middleware"
	"github.com/Hammadullah2/Roadlytics/backend/lib/modelclient"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/evaluationsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/progresssvc"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// ResultHandler serves read-only endpoints for model outputs.
type ResultHandler struct {
	evaluations  evaluationsvc.EvaluationService
	progress     progresssvc.ProgressService
	modelClient  *modelclient.Client
	planetAPIKey string
}

// NewResultHandler creates a result handler from evaluation and progress services.
// modelClient may be nil when no inference server is configured.
// planetAPIKey may be empty when Planet integration is disabled.
func NewResultHandler(evaluations evaluationsvc.EvaluationService, progress progresssvc.ProgressService, modelClient *modelclient.Client, planetAPIKey string) *ResultHandler {
	return &ResultHandler{
		evaluations:  evaluations,
		progress:     progress,
		modelClient:  modelClient,
		planetAPIKey: planetAPIKey,
	}
}

// GetAll returns all available results for a job owned by the authenticated user.
func (h *ResultHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if _, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID); err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	results, err := h.evaluations.GetJobResults(r.Context(), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load job results")
		return
	}

	response.JSON(w, http.StatusOK, results)
}

// GetSegmentation returns segmentation output for a job owned by the user.
func (h *ResultHandler) GetSegmentation(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if _, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID); err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	result, err := h.evaluations.GetSegmentationResults(r.Context(), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load segmentation result")
		return
	}

	response.JSON(w, http.StatusOK, result)
}

// GetClassification returns classification output for a job owned by the user.
func (h *ResultHandler) GetClassification(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if _, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID); err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	results, err := h.evaluations.GetClassificationResults(r.Context(), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load classification results")
		return
	}

	response.JSON(w, http.StatusOK, results)
}

// GetConnectivity returns connectivity output for a job owned by the user.
func (h *ResultHandler) GetConnectivity(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if _, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID); err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	result, err := h.evaluations.GetConnectivityGraph(r.Context(), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load connectivity graph")
		return
	}

	response.JSON(w, http.StatusOK, result)
}


