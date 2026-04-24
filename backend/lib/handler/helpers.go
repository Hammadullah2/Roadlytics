// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

type successEnvelope struct {
	Data    any    `json:"data"`
	Message string `json:"message"`
}

func decodeJSON(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("decode request body: %w", err)
	}

	return nil
}

func writeSuccess(w http.ResponseWriter, status int, data any, message string) {
	response.JSON(w, status, successEnvelope{
		Data:    data,
		Message: message,
	})
}

func writeServiceError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		response.Error(w, http.StatusNotFound, "resource not found")
	case strings.Contains(err.Error(), "already exists"):
		response.Error(w, http.StatusConflict, err.Error())
	case strings.Contains(err.Error(), "required"),
		strings.Contains(err.Error(), "already"),
		strings.Contains(err.Error(), "invalid"),
		strings.Contains(err.Error(), "unsupported"),
		strings.Contains(err.Error(), "empty"):
		response.Error(w, http.StatusBadRequest, err.Error())
	default:
		slog.Error("handler service error", "fallback", fallback, "error", err.Error())
		response.Error(w, http.StatusInternalServerError, fallback)
	}
}
