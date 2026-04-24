// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	gorillaws "github.com/gorilla/websocket"

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
	"github.com/Hammadullah2/Roadlytics/backend/lib/middleware"
	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/progresssvc"
	jobws "github.com/Hammadullah2/Roadlytics/backend/lib/websocket"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// WebSocketHandler upgrades job-specific realtime connections and joins clients to job rooms.
type WebSocketHandler struct {
	upgrader gorillaws.Upgrader
	hub      *jobws.Hub
	progress progresssvc.ProgressService
}

// NewWebSocketHandler creates a websocket handler with frontend-aware origin checks.
func NewWebSocketHandler(cfg *config.Config, hub *jobws.Hub, progress progresssvc.ProgressService) *WebSocketHandler {
	frontendURL := ""
	if cfg != nil {
		frontendURL = cfg.FrontendURL
	}

	allowedOrigins := middleware.AllowedOrigins(frontendURL)

	return &WebSocketHandler{
		upgrader: gorillaws.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := strings.TrimSpace(r.Header.Get("Origin"))
				if origin == "" {
					return true
				}

				_, ok := allowedOrigins[origin]
				return ok
			},
		},
		hub:      hub,
		progress: progress,
	}
}

// Connect upgrades an authenticated HTTP request into a websocket subscribed to one job room.
func (h *WebSocketHandler) Connect(w http.ResponseWriter, r *http.Request) {
	if h.hub == nil {
		response.Error(w, http.StatusInternalServerError, "websocket hub is not configured")
		return
	}

	if h.progress == nil {
		response.Error(w, http.StatusInternalServerError, "progress service is not configured")
		return
	}

	jobID := strings.TrimSpace(chi.URLParam(r, "id"))
	if jobID == "" {
		response.Error(w, http.StatusBadRequest, "job id is required")
		return
	}

	job, err := h.progress.GetJob(r.Context(), middleware.UserIDFromContext(r.Context()), jobID)
	if err != nil {
		writeServiceError(w, err, "failed to authorize websocket job access")
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "failed to upgrade websocket connection")
		return
	}

	client := h.hub.RegisterClient(conn, jobID)
	initialStatus := jobws.Message{
		JobID:    job.ID,
		Type:     "status",
		Progress: normalizeJobProgress(job.Progress),
		Status:   job.Status,
		Stage:    stageFromJob(job.Progress, job.Status),
	}

	if job.Status == models.JobStatusCompleted {
		initialStatus.Type = "result"
	}

	if job.Status == models.JobStatusFailed {
		initialStatus.Type = "error"
		if job.ErrorMessage != nil && strings.TrimSpace(*job.ErrorMessage) != "" {
			initialStatus.Payload = map[string]string{
				"message": *job.ErrorMessage,
			}
		}
	}

	if err := client.QueueMessage(initialStatus); err != nil {
		_ = conn.Close()
		return
	}

	go client.WritePump()
	go client.ReadPump()
}

func stageFromJob(progress int, status string) string {
	if status == models.JobStatusCompleted {
		return models.JobTypeConnectivity
	}

	if progress >= 66 {
		return models.JobTypeConnectivity
	}

	if progress >= 33 {
		return models.JobTypeClassification
	}

	return models.JobTypeSegmentation
}

func normalizeJobProgress(progress int) int {
	if progress < 0 {
		return 0
	}

	if progress > 100 {
		return 100
	}

	return progress
}
