// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"io"
	"net/http"
	"strings"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// UploadHandler serves file-upload endpoints backed by Supabase Storage.
type UploadHandler struct {
	ingestion ingestionsvc.IngestionService
}

// NewUploadHandler creates an upload handler from the ingestion service dependency.
func NewUploadHandler(ingestion ingestionsvc.IngestionService) *UploadHandler {
	return &UploadHandler{ingestion: ingestion}
}

// UploadGeoJSON uploads a GeoJSON file to the user's storage folder.
func (h *UploadHandler) UploadGeoJSON(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	contentType := r.Header.Get("Content-Type")

	var (
		filename string
		data     []byte
		err      error
	)

	if strings.HasPrefix(contentType, "multipart/form-data") {
		file, header, fileErr := r.FormFile("file")
		if fileErr != nil {
			response.Error(w, http.StatusBadRequest, "file is required")
			return
		}
		defer file.Close()

		filename = header.Filename
		if header.Header.Get("Content-Type") != "" {
			contentType = header.Header.Get("Content-Type")
		}

		data, err = io.ReadAll(file)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "failed to read uploaded file")
			return
		}
	} else {
		filename = strings.TrimSpace(r.URL.Query().Get("filename"))
		if filename == "" {
			filename = "upload.geojson"
		}

		if strings.TrimSpace(contentType) == "" {
			contentType = "application/geo+json"
		}

		data, err = io.ReadAll(r.Body)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "failed to read request body")
			return
		}
	}

	if len(data) == 0 {
		response.Error(w, http.StatusBadRequest, "geojson payload is empty")
		return
	}

	path, err := h.ingestion.UploadGeoJSON(r.Context(), userID, filename, data, contentType)
	if err != nil {
		writeServiceError(w, err, "failed to upload geojson")
		return
	}

	response.JSON(w, http.StatusCreated, map[string]string{
		"path": path,
	})
}
