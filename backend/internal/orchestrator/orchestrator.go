// Package orchestrator coordinates the backend goroutines that track and publish job progress.
package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/modelclient"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/planet"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
	jobws "github.com/murtazatunio/road-quality-assessment/backend/internal/websocket"
)

// JobUpdateRequest represents a persisted status/progress change for a job.
type JobUpdateRequest struct {
	JobID     string
	Progress  int
	Status    string
	Stage     string
	Downloads *models.JobDownloads
	Stats     *models.JobStats
}

// FinalJobEvent represents a completed or failed job notification for the frontend.
type FinalJobEvent struct {
	JobID    string
	Progress int
	Status   string
	Stage    string
}

// Orchestrator manages all background goroutines and the typed channels between them.
type Orchestrator struct {
	wg sync.WaitGroup

	logger       *slog.Logger
	jobs         repository.JobRepository
	regions      repository.RegionRepository
	hub          *jobws.Hub
	modelClient  *modelclient.Client
	planetAPIKey string

	dispatchCh chan string
	dbUpdateCh chan JobUpdateRequest
	uiPushCh   chan jobws.Message
	alertCh    chan FinalJobEvent
}

// New creates an orchestrator with the dependencies needed for realtime job updates.
func New(jobs repository.JobRepository, regions repository.RegionRepository, hub *jobws.Hub, logger *slog.Logger, modelClient *modelclient.Client, planetAPIKey string) *Orchestrator {
	return &Orchestrator{
		logger:       logger,
		jobs:         jobs,
		regions:      regions,
		hub:          hub,
		modelClient:  modelClient,
		planetAPIKey: planetAPIKey,
		dispatchCh:   make(chan string, 64),
		dbUpdateCh:   make(chan JobUpdateRequest, 128),
		uiPushCh:     make(chan jobws.Message, 256),
		alertCh:      make(chan FinalJobEvent, 64),
	}
}

// Start launches the orchestrator workers and keeps them running until the context is cancelled.
func (o *Orchestrator) Start(ctx context.Context) {
	o.startWorker(ctx, "progress_poller", o.runProgressPoller)
	o.startWorker(ctx, "live_db_updater", o.runLiveDBUpdater)
	o.startWorker(ctx, "ui_push_service", o.runUIPushService)
	o.startWorker(ctx, "job_listener", o.runJobListener)
	o.startWorker(ctx, "model_dispatcher", o.runModelDispatcher)
	o.startWorker(ctx, "queue_monitor", o.runQueueMonitor)
	o.startWorker(ctx, "frontend_alerter", o.runFrontendAlerter)
}

// Shutdown waits for all orchestrator workers to exit after the parent context is cancelled.
func (o *Orchestrator) Shutdown() {
	o.wg.Wait()
}

// EnqueueJobUpdate pushes a DB-backed job update into the orchestrator without blocking callers indefinitely.
func (o *Orchestrator) EnqueueJobUpdate(update JobUpdateRequest) error {
	if update.JobID == "" {
		return fmt.Errorf("job id is required")
	}

	select {
	case o.dbUpdateCh <- update:
		return nil
	default:
		return fmt.Errorf("job update queue is full")
	}
}

// ApplyJobUpdate persists and broadcasts a job update synchronously.
func (o *Orchestrator) ApplyJobUpdate(ctx context.Context, update JobUpdateRequest) error {
	if update.JobID == "" {
		return fmt.Errorf("job id is required")
	}

	return o.persistJobUpdate(ctx, update)
}

func (o *Orchestrator) startWorker(ctx context.Context, name string, worker func(context.Context)) {
	o.wg.Add(1)

	go func() {
		defer o.wg.Done()
		defer func() {
			if recovered := recover(); recovered != nil {
				o.logError("orchestrator worker panicked", "worker", name, "panic", recovered)
			}
			o.logInfo("orchestrator worker stopped", "worker", name)
		}()

		o.logInfo("orchestrator worker started", "worker", name)
		worker(ctx)
	}()
}

func (o *Orchestrator) runProgressPoller(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	o.pushRunningJobProgress(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.pushRunningJobProgress(ctx)
		}
	}
}

func (o *Orchestrator) runLiveDBUpdater(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case update := <-o.dbUpdateCh:
			if err := o.persistJobUpdate(ctx, update); err != nil {
				o.logError("failed to persist job update", "job_id", update.JobID, "error", err)
			}
		}
	}
}

func (o *Orchestrator) runUIPushService(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case message := <-o.uiPushCh:
			if o.hub == nil {
				o.logWarn("dropping UI push because websocket hub is not configured", "job_id", message.JobID)
				continue
			}

			o.hub.BroadcastToJob(message.JobID, message)
		}
	}
}

func (o *Orchestrator) runJobListener(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	dispatched := make(map[string]struct{})
	o.dispatchPendingJobs(ctx, dispatched)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.dispatchPendingJobs(ctx, dispatched)
		}
	}
}

func (o *Orchestrator) runModelDispatcher(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case jobID := <-o.dispatchCh:
			if jobID == "" {
				continue
			}

			o.dispatchToInferenceServer(ctx, jobID)
		}
	}
}

func (o *Orchestrator) dispatchToInferenceServer(ctx context.Context, jobID string) {
	if o.modelClient == nil {
		o.logWarn("inference server not configured — marking job as running without dispatch", "job_id", jobID)

		if o.planetAPIKey != "" {
			o.wg.Add(1)
			go func() {
				defer o.wg.Done()
				o.tryStorePlanetScene(ctx, jobID)
			}()
		}

		if err := o.EnqueueJobUpdate(JobUpdateRequest{
			JobID:    jobID,
			Status:   models.JobStatusRunning,
			Progress: 0,
			Stage:    models.JobTypeSegmentation,
		}); err != nil {
			o.logError("failed to queue running status update", "job_id", jobID, "error", err)
		}

		return
	}

	job, err := o.jobs.GetByID(ctx, jobID)
	if err != nil {
		o.logError("failed to load job for dispatch", "job_id", jobID, "error", err)
		return
	}

	region, err := o.regions.GetByID(ctx, job.RegionID)
	if err != nil {
		o.logError("failed to load region for job dispatch", "job_id", jobID, "region_id", job.RegionID, "error", err)
		return
	}

	bbox, err := modelclient.BBoxFromPolygon(region.Polygon)
	if err != nil {
		o.logError("failed to compute bbox from region polygon", "job_id", jobID, "error", err)
		return
	}

	var refs models.JobResultRefs
	if len(job.ResultRefs) > 0 {
		_ = json.Unmarshal(job.ResultRefs, &refs)
	}

	req := modelclient.FetchAndRunRequest{
		AOIBbox:    bbox,
		RegionName: region.Name,
	}

	if refs.Params != nil {
		req.StartDate = refs.Params.StartDate
		req.EndDate = refs.Params.EndDate
		req.MaxCloudCover = refs.Params.MaxCloudCover
		req.ResolutionM = refs.Params.ResolutionM
	} else {
		req.MaxCloudCover = 0.20
		req.ResolutionM = 10
	}

	resp, err := o.modelClient.FetchAndRun(ctx, req)
	if err != nil {
		o.logError("inference server fetch-and-run failed", "job_id", jobID, "error", err)
		if err := o.EnqueueJobUpdate(JobUpdateRequest{
			JobID:  jobID,
			Status: models.JobStatusFailed,
			Stage:  models.JobTypeSegmentation,
		}); err != nil {
			o.logError("failed to queue failed status", "job_id", jobID, "error", err)
		}

		return
	}

	refs.InferenceJobID = resp.JobID
	if err := o.jobs.UpdateResultRefs(ctx, jobID, &refs); err != nil {
		o.logWarn("failed to store inference job id in result_refs", "job_id", jobID, "error", err)
	}

	if err := o.EnqueueJobUpdate(JobUpdateRequest{
		JobID:    jobID,
		Status:   models.JobStatusRunning,
		Progress: 0,
		Stage:    models.JobTypeSegmentation,
	}); err != nil {
		o.logError("failed to queue running status update", "job_id", jobID, "error", err)
	}

	o.wg.Add(1)
	go func() {
		defer o.wg.Done()
		o.watchInferenceJob(ctx, jobID, resp.JobID)
	}()
}

// tryStorePlanetScene searches Planet Copernicus for the best Sentinel-2 scene covering
// the job's region and stores the scene_id in result_refs so the frontend can display
// satellite imagery even when the inference server is not running.
func (o *Orchestrator) tryStorePlanetScene(ctx context.Context, jobID string) {
	job, err := o.jobs.GetByID(ctx, jobID)
	if err != nil {
		o.logWarn("planet: failed to load job", "job_id", jobID, "error", err)
		return
	}

	region, err := o.regions.GetByID(ctx, job.RegionID)
	if err != nil {
		o.logWarn("planet: failed to load region", "job_id", jobID, "error", err)
		return
	}

	bbox, err := modelclient.BBoxFromPolygon(region.Polygon)
	if err != nil {
		o.logWarn("planet: failed to compute bbox", "job_id", jobID, "error", err)
		return
	}

	var refs models.JobResultRefs
	if len(job.ResultRefs) > 0 {
		_ = json.Unmarshal(job.ResultRefs, &refs)
	}

	startDate := ""
	endDate := ""
	maxCC := 0.30
	if refs.Params != nil && refs.Params.StartDate != "" {
		startDate = refs.Params.StartDate
		endDate = refs.Params.EndDate
		if refs.Params.MaxCloudCover > 0 {
			maxCC = refs.Params.MaxCloudCover
		}
	}
	if startDate == "" {
		now := time.Now().UTC()
		endDate = now.Format("2006-01-02")
		startDate = now.AddDate(0, -3, 0).Format("2006-01-02")
	}

	scene, err := planet.SearchBestScene(ctx, o.planetAPIKey, bbox[0], bbox[1], bbox[2], bbox[3], startDate, endDate, maxCC)
	if err != nil {
		o.logWarn("planet: scene search failed", "job_id", jobID, "error", err)
		return
	}
	if scene == nil {
		o.logInfo("planet: no scene found for job", "job_id", jobID, "start_date", startDate, "end_date", endDate)
		return
	}

	refs.SceneID = scene.SceneID
	refs.SceneDate = scene.SceneDate
	if err := o.jobs.UpdateResultRefs(ctx, jobID, &refs); err != nil {
		o.logWarn("planet: failed to store scene in result_refs", "job_id", jobID, "error", err)
		return
	}

	o.logInfo("planet: scene stored for job", "job_id", jobID, "scene_id", scene.SceneID, "scene_date", scene.SceneDate)

	// Notify the frontend so it can add the satellite tile layer without a page refresh.
	_ = o.enqueueUIMessage(jobws.Message{
		JobID:   jobID,
		Type:    "satellite_ready",
		Status:  models.JobStatusRunning,
		Payload: map[string]string{"scene_id": scene.SceneID},
	})
}

func (o *Orchestrator) runQueueMonitor(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pendingJobs, err := o.jobs.ListPending(ctx)
			if err != nil {
				o.logError("failed to inspect pending job queue", "error", err)
				continue
			}

			if len(pendingJobs) > 10 {
				o.logWarn("job queue depth is above the warning threshold", "pending_jobs", len(pendingJobs))
			}
		}
	}
}

func (o *Orchestrator) runFrontendAlerter(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case event := <-o.alertCh:
			message := jobws.Message{
				JobID:    event.JobID,
				Type:     "result",
				Progress: event.Progress,
				Status:   event.Status,
				Stage:    event.Stage,
			}

			if event.Status == models.JobStatusFailed {
				message.Type = "error"
				message.Payload = map[string]string{
					"message": fmt.Sprintf("Job failed during %s.", event.Stage),
				}
			}

			if event.Status == models.JobStatusCompleted {
				message.Payload = map[string]string{
					"message": "Job completed successfully.",
				}
			}

			if err := o.enqueueUIMessage(message); err != nil {
				o.logWarn("failed to queue final frontend alert", "job_id", event.JobID, "error", err)
			}
		}
	}
}

func (o *Orchestrator) pushRunningJobProgress(ctx context.Context) {
	runningJobs, err := o.jobs.ListRunning(ctx)
	if err != nil {
		o.logError("failed to poll running jobs", "error", err)
		return
	}

	for _, job := range runningJobs {
		if job == nil {
			continue
		}

		if err := o.enqueueUIMessage(jobws.Message{
			JobID:    job.ID,
			Type:     "progress",
			Progress: clampProgress(job.Progress),
			Status:   job.Status,
			Stage:    stageForJob(job.Progress, job.Status),
		}); err != nil {
			o.logWarn("failed to queue job progress broadcast", "job_id", job.ID, "error", err)
		}
	}
}

func (o *Orchestrator) dispatchPendingJobs(ctx context.Context, dispatched map[string]struct{}) {
	pendingJobs, err := o.jobs.ListPending(ctx)
	if err != nil {
		o.logError("failed to poll pending jobs", "error", err)
		return
	}

	currentPending := make(map[string]struct{}, len(pendingJobs))
	for _, job := range pendingJobs {
		if job == nil {
			continue
		}

		currentPending[job.ID] = struct{}{}
		if _, seen := dispatched[job.ID]; seen {
			continue
		}

		select {
		case <-ctx.Done():
			return
		case o.dispatchCh <- job.ID:
			dispatched[job.ID] = struct{}{}
		}
	}

	for jobID := range dispatched {
		if _, stillPending := currentPending[jobID]; !stillPending {
			delete(dispatched, jobID)
		}
	}
}

// watchInferenceJob subscribes to the inference server WebSocket for a running job and
// bridges stage events into the orchestrator's progress/status channels.
// Reconnects with exponential backoff on transient connection loss so that an
// inference server restart mid-job doesn't orphan the tracking goroutine. Exits
// when the job reaches a terminal state, the parent context is cancelled, or
// the maximum number of reconnect attempts is exhausted.
func (o *Orchestrator) watchInferenceJob(ctx context.Context, ourJobID, inferenceJobID string) {
	wsURL := o.inferenceWSURL(inferenceJobID)
	if wsURL == "" {
		o.logWarn("cannot watch inference job — no model client configured", "job_id", ourJobID)
		return
	}

	const maxReconnectAttempts = 10
	backoff := 2 * time.Second
	const maxBackoff = 60 * time.Second

	reconnects := 0
	for {
		if err := ctx.Err(); err != nil {
			return
		}

		terminal, reason := o.streamInferenceWebSocket(ctx, ourJobID, inferenceJobID, wsURL)
		if terminal {
			return
		}

		reconnects++
		if reconnects > maxReconnectAttempts {
			o.logError("giving up on inference websocket after max reconnects",
				"job_id", ourJobID, "inference_job_id", inferenceJobID, "attempts", reconnects, "last_reason", reason)
			if err := o.EnqueueJobUpdate(JobUpdateRequest{
				JobID:  ourJobID,
				Status: models.JobStatusFailed,
				Stage:  models.JobTypeConnectivity,
			}); err != nil {
				o.logWarn("failed to mark job failed after ws give-up", "job_id", ourJobID, "error", err)
			}
			return
		}

		o.logWarn("inference websocket dropped — will reconnect",
			"job_id", ourJobID, "inference_job_id", inferenceJobID, "attempt", reconnects, "reason", reason, "backoff", backoff)

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}

		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}

// streamInferenceWebSocket connects once and pumps events until the job
// reaches a terminal state (returns terminal=true) or the connection drops
// (returns terminal=false with a reason). Only terminal=true should stop the
// parent reconnect loop.
func (o *Orchestrator) streamInferenceWebSocket(ctx context.Context, ourJobID, inferenceJobID, wsURL string) (bool, string) {
	dialCtx, cancelDial := context.WithTimeout(ctx, 10*time.Second)
	conn, _, err := websocket.DefaultDialer.DialContext(dialCtx, wsURL, nil)
	cancelDial()
	if err != nil {
		if ctx.Err() != nil {
			return true, "context cancelled"
		}
		return false, fmt.Sprintf("dial failed: %v", err)
	}
	defer conn.Close()

	for {
		if err := ctx.Err(); err != nil {
			return true, "context cancelled"
		}

		_, msg, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return true, "context cancelled"
			}
			return false, fmt.Sprintf("read failed: %v", err)
		}

		var event modelclient.InferenceWSEvent
		if err := json.Unmarshal(msg, &event); err != nil {
			continue
		}

		update := o.inferenceEventToUpdate(ourJobID, event)
		if update == nil {
			continue
		}

		if update.Downloads != nil || update.Stats != nil {
			job, err := o.jobs.GetByID(ctx, ourJobID)
			if err == nil {
				var refs models.JobResultRefs
				if len(job.ResultRefs) > 0 {
					_ = json.Unmarshal(job.ResultRefs, &refs)
				}

				if update.Downloads != nil {
					refs.Downloads = update.Downloads
				}

				if update.Stats != nil {
					refs.Stats = update.Stats
				}

				if err := o.jobs.UpdateResultRefs(ctx, ourJobID, &refs); err != nil {
					o.logWarn("failed to persist inference output refs", "job_id", ourJobID, "error", err)
				}
			}
		}

		if err := o.ApplyJobUpdate(ctx, *update); err != nil {
			o.logError("failed to apply inference job update", "job_id", ourJobID, "error", err)
		}

		if update.Status == models.JobStatusCompleted || update.Status == models.JobStatusFailed {
			return true, "terminal state"
		}
	}
}

func (o *Orchestrator) inferenceWSURL(inferenceJobID string) string {
	if o.modelClient == nil {
		return ""
	}

	return o.modelClient.WSBaseURL() + "/ws/jobs/" + inferenceJobID
}

// inferenceEventToUpdate maps an inference server WebSocket event to an orchestrator update.
// Returns nil if the event requires no action.
func (o *Orchestrator) inferenceEventToUpdate(jobID string, event modelclient.InferenceWSEvent) *JobUpdateRequest {
	stage := event.Payload.Stage
	pct := event.Payload.ProgressPct

	switch event.Type {
	case "stage_started":
		return &JobUpdateRequest{
			JobID:    jobID,
			Status:   models.JobStatusRunning,
			Progress: inferenceStageBaseProgress(stage),
			Stage:    inferenceStageToBackend(stage),
		}
	case "progress_update":
		return &JobUpdateRequest{
			JobID:    jobID,
			Status:   models.JobStatusRunning,
			Progress: inferenceProgressToBackend(stage, pct),
			Stage:    inferenceStageToBackend(stage),
		}
	case "stage_completed":
		return &JobUpdateRequest{
			JobID:    jobID,
			Status:   models.JobStatusRunning,
			Progress: inferenceStageEndProgress(stage),
			Stage:    inferenceStageToBackend(stage),
		}
	case "job_completed":
		return &JobUpdateRequest{
			JobID:     jobID,
			Status:    models.JobStatusCompleted,
			Progress:  100,
			Stage:     models.JobTypeConnectivity,
			Downloads: event.Payload.Outputs,
			Stats:     event.Payload.Stats,
		}
	case "job_failed":
		return &JobUpdateRequest{
			JobID:    jobID,
			Status:   models.JobStatusFailed,
			Progress: 0,
			Stage:    inferenceStageToBackend(stage),
		}
	}

	return nil
}

// inferenceStageToBackend maps the inference server's 6-stage names to the backend's 3-stage model.
func inferenceStageToBackend(stage string) string {
	switch stage {
	case "fetch", "preprocess", "segment":
		return models.JobTypeSegmentation
	case "classify":
		return models.JobTypeClassification
	case "graph", "report":
		return models.JobTypeConnectivity
	default:
		return models.JobTypeSegmentation
	}
}

// inferenceStageBaseProgress returns the progress value when a stage starts.
func inferenceStageBaseProgress(stage string) int {
	switch stage {
	case "fetch":
		return 0
	case "preprocess":
		return 5
	case "segment":
		return 16
	case "classify":
		return 33
	case "graph":
		return 66
	case "report":
		return 85
	default:
		return 0
	}
}

// inferenceStageEndProgress returns the progress value when a stage ends.
func inferenceStageEndProgress(stage string) int {
	switch stage {
	case "fetch":
		return 5
	case "preprocess":
		return 16
	case "segment":
		return 33
	case "classify":
		return 66
	case "graph":
		return 85
	case "report":
		return 99
	default:
		return 0
	}
}

// inferenceProgressToBackend maps per-stage pct (0–100) to the overall 0–100 range.
func inferenceProgressToBackend(stage string, pct int) int {
	base := inferenceStageBaseProgress(stage)
	end := inferenceStageEndProgress(stage)
	span := end - base
	if span <= 0 {
		return base
	}

	return base + (pct * span / 100)
}

func (o *Orchestrator) persistJobUpdate(ctx context.Context, update JobUpdateRequest) error {
	progress := clampProgress(update.Progress)

	if update.Status != "" {
		if err := o.jobs.UpdateStatus(ctx, update.JobID, update.Status); err != nil {
			return fmt.Errorf("update job status %q: %w", update.JobID, err)
		}
	}

	if err := o.jobs.UpdateProgress(ctx, update.JobID, progress); err != nil {
		return fmt.Errorf("update job progress %q: %w", update.JobID, err)
	}

	if update.Downloads != nil || update.Stats != nil {
		job, err := o.jobs.GetByID(ctx, update.JobID)
		if err == nil {
			var refs models.JobResultRefs
			if len(job.ResultRefs) > 0 {
				_ = json.Unmarshal(job.ResultRefs, &refs)
			}

			if update.Downloads != nil {
				refs.Downloads = update.Downloads
			}

			if update.Stats != nil {
				refs.Stats = update.Stats
			}

			if err := o.jobs.UpdateResultRefs(ctx, update.JobID, &refs); err != nil {
				o.logWarn("failed to persist result refs from callback", "job_id", update.JobID, "error", err)
			}
		}
	}

	job, err := o.jobs.GetByID(ctx, update.JobID)
	if err != nil {
		return fmt.Errorf("load updated job %q: %w", update.JobID, err)
	}

	stage := update.Stage
	if stage == "" {
		stage = stageForJob(job.Progress, job.Status)
	}

	if err := o.enqueueUIMessage(jobws.Message{
		JobID:    job.ID,
		Type:     messageTypeForJob(job.Status, job.Progress),
		Progress: clampProgress(job.Progress),
		Status:   job.Status,
		Stage:    stage,
	}); err != nil {
		o.logWarn("failed to queue job update broadcast", "job_id", job.ID, "error", err)
	}

	if job.Status == models.JobStatusCompleted || job.Status == models.JobStatusFailed {
		select {
		case o.alertCh <- FinalJobEvent{
			JobID:    job.ID,
			Progress: clampProgress(job.Progress),
			Status:   job.Status,
			Stage:    stage,
		}:
		default:
			o.logWarn("dropping final job alert because the queue is full", "job_id", job.ID)
		}
	}

	return nil
}

func (o *Orchestrator) enqueueUIMessage(message jobws.Message) error {
	select {
	case o.uiPushCh <- message:
		return nil
	default:
		return fmt.Errorf("ui push queue is full")
	}
}

func messageTypeForJob(status string, progress int) string {
	switch status {
	case models.JobStatusCompleted, models.JobStatusFailed:
		return "status"
	case models.JobStatusRunning:
		if progress > 0 {
			return "progress"
		}
	}

	return "status"
}

func stageForJob(progress int, status string) string {
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

func clampProgress(progress int) int {
	if progress < 0 {
		return 0
	}

	if progress > 100 {
		return 100
	}

	return progress
}

func (o *Orchestrator) logInfo(message string, args ...any) {
	if o.logger == nil {
		return
	}

	o.logger.Info(message, args...)
}

func (o *Orchestrator) logWarn(message string, args ...any) {
	if o.logger == nil {
		return
	}

	o.logger.Warn(message, args...)
}

func (o *Orchestrator) logError(message string, args ...any) {
	if o.logger == nil {
		return
	}

	o.logger.Error(message, args...)
}
