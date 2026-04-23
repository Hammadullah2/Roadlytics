// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// ProjectHandler serves project CRUD endpoints.
type ProjectHandler struct {
	ingestion ingestionsvc.IngestionService
}

// NewProjectHandler creates a project handler from the ingestion service dependency.
func NewProjectHandler(ingestion ingestionsvc.IngestionService) *ProjectHandler {
	return &ProjectHandler{ingestion: ingestion}
}

// Create creates a new project for the authenticated user.
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
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

	project, err := h.ingestion.CreateProject(r.Context(), middleware.UserIDFromContext(r.Context()), req.Name, strings.TrimSpace(req.Description))
	if err != nil {
		writeServiceError(w, err, "failed to create project")
		return
	}

	response.JSON(w, http.StatusCreated, project)
}

// List returns the authenticated user's projects.
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	projects, err := h.ingestion.ListProjects(r.Context(), middleware.UserIDFromContext(r.Context()))
	if err != nil {
		writeServiceError(w, err, "failed to list projects")
		return
	}

	response.JSON(w, http.StatusOK, projects)
}

// Get returns a project by ID for the authenticated user.
func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	project, err := h.ingestion.GetProject(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to load project")
		return
	}

	response.JSON(w, http.StatusOK, project)
}

// Update updates a project owned by the authenticated user.
func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())

	current, err := h.ingestion.GetProject(r.Context(), userID, projectID)
	if err != nil {
		writeServiceError(w, err, "failed to load project")
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Status      *string `json:"status"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil {
		current.Name = strings.TrimSpace(*req.Name)
	}

	if req.Description != nil {
		current.Description = strings.TrimSpace(*req.Description)
	}

	if req.Status != nil {
		current.Status = strings.TrimSpace(*req.Status)
	}

	if strings.TrimSpace(current.Name) == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	updated, err := h.ingestion.UpdateProject(r.Context(), userID, &models.Project{
		ID:          current.ID,
		Name:        current.Name,
		Description: current.Description,
		Status:      current.Status,
	})
	if err != nil {
		writeServiceError(w, err, "failed to update project")
		return
	}

	response.JSON(w, http.StatusOK, updated)
}

// Delete removes a project owned by the authenticated user.
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.ingestion.DeleteProject(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err, "failed to delete project")
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{"message": "project deleted"})
}
