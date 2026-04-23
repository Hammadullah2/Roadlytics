// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/modelclient"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/evaluationsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/progresssvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
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

// GetRoadsGeoJSON streams the classified roads GeoJSON for a job.
// The inference pipeline writes the roads LineString FeatureCollection as "graph_geojson"
// (graph.py reprojects the classified roads shapefile to EPSG:4326 and writes GeoJSON).
// This endpoint proxies that file from the inference server so the frontend can fetch it
// with the same auth boundary as the rest of the API.
func (h *ResultHandler) GetRoadsGeoJSON(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	job, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to load job")
		return
	}

	if len(job.ResultRefs) == 0 {
		response.Error(w, http.StatusNotFound, "roads GeoJSON not yet available")
		return
	}

	var refs models.JobResultRefs
	if err := json.Unmarshal(job.ResultRefs, &refs); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to parse job result refs")
		return
	}

	if refs.InferenceJobID == "" || refs.Downloads == nil || refs.Downloads.GraphGeoJSON == "" {
		response.Error(w, http.StatusNotFound, "roads GeoJSON not yet available")
		return
	}

	if h.modelClient == nil {
		response.Error(w, http.StatusServiceUnavailable, "inference server is not configured")
		return
	}

	upstream, err := h.modelClient.DownloadFile(r.Context(), refs.InferenceJobID, "graph_geojson")
	if err != nil {
		response.Error(w, http.StatusBadGateway, "failed to reach inference server")
		return
	}
	defer upstream.Body.Close()

	if upstream.StatusCode != http.StatusOK {
		response.Error(w, upstream.StatusCode, "inference server did not return the roads GeoJSON")
		return
	}

	w.Header().Set("Content-Type", "application/geo+json")
	if ct := upstream.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if cl := upstream.Header.Get("Content-Length"); cl != "" {
		w.Header().Set("Content-Length", cl)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, upstream.Body)
}

// GetSatelliteTile proxies a Sentinel-2 tile from Planet's tile CDN, hiding the API key server-side.
// The scene_id path parameter must match a Planet Sentinel2L2A item ID.
// This endpoint is intentionally open (no JWT required) because tile requests from Leaflet
// cannot carry custom headers and satellite imagery is not sensitive user data.
func (h *ResultHandler) GetSatelliteTile(w http.ResponseWriter, r *http.Request) {
	if h.planetAPIKey == "" {
		response.Error(w, http.StatusServiceUnavailable, "satellite tiles not configured")
		return
	}

	sceneID := chi.URLParam(r, "scene_id")
	z := chi.URLParam(r, "z")
	x := chi.URLParam(r, "x")
	y := chi.URLParam(r, "y")

	if sceneID == "" || z == "" || x == "" || y == "" {
		response.Error(w, http.StatusBadRequest, "scene_id, z, x, and y are required")
		return
	}

	tileURL := fmt.Sprintf(
		"https://tiles.planet.com/data/v1/Sentinel2L2A/%s/%s/%s/%s.png?api_key=%s",
		sceneID, z, x, y, h.planetAPIKey,
	)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, tileURL, nil)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to build tile request")
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		response.Error(w, http.StatusBadGateway, "failed to fetch satellite tile")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		response.Error(w, http.StatusNotFound, "satellite tile not found")
		return
	}
	if resp.StatusCode != http.StatusOK {
		response.Error(w, http.StatusBadGateway, "satellite tile unavailable")
		return
	}

	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/png"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, resp.Body)
}
