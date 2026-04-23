// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/reportsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// ReportHandler serves report generation and retrieval endpoints.
type ReportHandler struct {
	reports reportsvc.ReportService
}

// NewReportHandler creates a report handler from the report service dependency.
func NewReportHandler(reports reportsvc.ReportService) *ReportHandler {
	return &ReportHandler{reports: reports}
}

// Generate creates a report record and returns a signed URL when available.
func (h *ReportHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ReportType string `json:"report_type"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.ReportType = strings.TrimSpace(req.ReportType)
	if req.ReportType == "" {
		response.Error(w, http.StatusBadRequest, "report_type is required")
		return
	}

	report, err := h.reports.GenerateReport(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"), req.ReportType)
	if err != nil {
		writeServiceError(w, err, "failed to generate report")
		return
	}

	response.JSON(w, http.StatusCreated, report)
}

// List returns reports for a job owned by the authenticated user.
func (h *ReportHandler) List(w http.ResponseWriter, r *http.Request) {
	reports, err := h.reports.ListReports(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to list reports")
		return
	}

	response.JSON(w, http.StatusOK, reports)
}

// ListAll returns every report owned by the authenticated user.
func (h *ReportHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	reports, err := h.reports.ListUserReports(r.Context(), middleware.UserIDFromContext(r.Context()))
	if err != nil {
		writeServiceError(w, err, "failed to list reports")
		return
	}

	response.JSON(w, http.StatusOK, reports)
}

// Get returns a report by ID for the authenticated user.
func (h *ReportHandler) Get(w http.ResponseWriter, r *http.Request) {
	report, err := h.reports.GetReport(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to load report")
		return
	}

	response.JSON(w, http.StatusOK, report)
}

// Delete removes a report owned by the authenticated user.
func (h *ReportHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.reports.DeleteReport(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id")); err != nil {
		writeServiceError(w, err, "failed to delete report")
		return
	}

	response.JSON(w, http.StatusOK, map[string]string{"message": "report deleted"})
}

// Download redirects to a short-lived signed URL for a report owned by the authenticated user.
func (h *ReportHandler) Download(w http.ResponseWriter, r *http.Request) {
	report, err := h.reports.GetReport(r.Context(), middleware.UserIDFromContext(r.Context()), chi.URLParam(r, "id"))
	if err != nil {
		writeServiceError(w, err, "failed to load report download")
		return
	}

	if strings.TrimSpace(report.SignedURL) == "" {
		response.Error(w, http.StatusNotFound, "report download is not available")
		return
	}

	http.Redirect(w, r, report.SignedURL, http.StatusFound)
}
