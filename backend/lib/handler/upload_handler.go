// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/ingestionsvc"
)

// UploadHandler serves file-upload endpoints backed by Supabase Storage.
type UploadHandler struct {
	ingestion ingestionsvc.IngestionService
}

// NewUploadHandler creates an upload handler from the ingestion service dependency.
func NewUploadHandler(ingestion ingestionsvc.IngestionService) *UploadHandler {
	return &UploadHandler{ingestion: ingestion}
}


