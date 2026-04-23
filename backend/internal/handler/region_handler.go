// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// RegionHandler serves region CRUD endpoints under projects.
type RegionHandler struct {
	ingestion ingestionsvc.IngestionService
}

// NewRegionHandler creates a region handler from the ingestion service dependency.
func NewRegionHandler(ingestion ingestionsvc.IngestionService) *RegionHandler {
	return &RegionHandler{ingestion: ingestion}
}

// Create creates a region under a project owned by the authenticated user.
func (h *RegionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string          `json:"name"`
		Polygon json.RawMessage `json:"polygon"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	if len(req.Polygon) == 0 {
		response.Error(w, http.StatusBadRequest, "polygon is required")
		return
	}

	region, err := h.ingestion.CreateRegion(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
		&models.Region{
			Name:    req.Name,
			Polygon: req.Polygon,
		},
	)
	if err != nil {
		writeServiceError(w, err, "failed to create region")
		return
	}

	response.JSON(w, http.StatusCreated, region)
}

// List returns regions for a project owned by the authenticated user.
func (h *RegionHandler) List(w http.ResponseWriter, r *http.Request) {
	regions, err := h.ingestion.ListRegions(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to list regions")
		return
	}

	response.JSON(w, http.StatusOK, regions)
}

// Get returns a region by ID for the authenticated user.
func (h *RegionHandler) Get(w http.ResponseWriter, r *http.Request) {
	region, err := h.ingestion.GetRegion(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
		chi.URLParam(r, "rid"),
	)
	if err != nil {
		writeServiceError(w, err, "failed to load region")
		return
	}

	response.JSON(w, http.StatusOK, region)
}

// GetByID returns a region by ID for the authenticated user.
func (h *RegionHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	region, err := h.ingestion.GetRegionByID(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
	)
	if err != nil {
		writeServiceError(w, err, "failed to load region")
		return
	}

	response.JSON(w, http.StatusOK, region)
}

// Delete removes a region owned by the authenticated user.
func (h *RegionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.ingestion.DeleteRegion(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
		chi.URLParam(r, "rid"),
	); err != nil {
		writeServiceError(w, err, "failed to delete region")
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{"message": "region deleted"})
}

// DeleteByID removes a region by ID for the authenticated user.
func (h *RegionHandler) DeleteByID(w http.ResponseWriter, r *http.Request) {
	if err := h.ingestion.DeleteRegionByID(
		r.Context(),
		middleware.UserIDFromContext(r.Context()),
		chi.URLParam(r, "id"),
	); err != nil {
		writeServiceError(w, err, "failed to delete region")
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{"message": "region deleted"})
}
