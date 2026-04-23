package notificationsvc

import (
	"log/slog"

	ws "github.com/murtazatunio/road-quality-assessment/backend/internal/websocket"
)

// Service handles WebSocket notifications for job progress and completion.
type Service struct {
	hub    *ws.Hub
	logger *slog.Logger
}

func New(hub *ws.Hub, logger *slog.Logger) *Service {
	return &Service{hub: hub, logger: logger}
}

// SendProgress pushes a progress update to all clients watching a job.
func (s *Service) SendProgress(jobID string, progress int) {
	s.hub.BroadcastToJob(jobID, ws.Message{
		Type:    "progress",
		JobID:   jobID,
		Payload: map[string]int{"progress": progress},
	})
}

// SendStageComplete notifies clients that a pipeline stage finished.
func (s *Service) SendStageComplete(jobID, stage string) {
	s.hub.BroadcastToJob(jobID, ws.Message{
		Type:    "stage_complete",
		JobID:   jobID,
		Payload: map[string]string{"stage": stage},
	})
}

// SendJobComplete notifies clients that a job is fully done.
func (s *Service) SendJobComplete(jobID string) {
	s.hub.BroadcastToJob(jobID, ws.Message{
		Type:  "job_complete",
		JobID: jobID,
	})
}

// SendError notifies clients of a job failure.
func (s *Service) SendError(jobID, message string) {
	s.hub.BroadcastToJob(jobID, ws.Message{
		Type:    "error",
		JobID:   jobID,
		Payload: map[string]string{"error": message},
	})
}
