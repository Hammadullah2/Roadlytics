// Package dispatch handles synchronous job dispatch to the inference server.
// In the Vercel deployment there are no background goroutines, so dispatch
// happens immediately and synchronously when a job is created.
package dispatch

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/Hammadullah2/Roadlytics/backend/lib/modelclient"
	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
)

// Dispatcher sends a newly created job to the inference server and updates the
// database with the resulting inference job ID.
type Dispatcher struct {
	jobs        repository.JobRepository
	regions     repository.RegionRepository
	modelClient *modelclient.Client
	logger      *slog.Logger
}

// New creates a Dispatcher. modelClient may be nil — in that case Dispatch is a no-op.
func New(
	jobs repository.JobRepository,
	regions repository.RegionRepository,
	modelClient *modelclient.Client,
	logger *slog.Logger,
) *Dispatcher {
	return &Dispatcher{
		jobs:        jobs,
		regions:     regions,
		modelClient: modelClient,
		logger:      logger,
	}
}

// Dispatch calls the inference server for jobID and updates the job row.
// segModel and clfModel are optional overrides (e.g. "osm", "deeplabv3", "kmeans", "efficientnet").
func (d *Dispatcher) Dispatch(ctx context.Context, jobID string, tifData []byte, segModel, clfModel string) error {
	if d.modelClient == nil {
		d.log().Warn("inference server not configured — job will stay pending", "job_id", jobID)
		return nil
	}

	job, err := d.jobs.GetByID(ctx, jobID)
	if err != nil {
		return fmt.Errorf("dispatch: load job %s: %w", jobID, err)
	}

	region, err := d.regions.GetByID(ctx, job.RegionID)
	if err != nil {
		return fmt.Errorf("dispatch: load region %s: %w", job.RegionID, err)
	}

	var refs models.JobResultRefs
	if len(job.ResultRefs) > 0 {
		_ = json.Unmarshal(job.ResultRefs, &refs)
	}

	resp, err := d.modelClient.UploadAndRun(ctx, tifData, region.Name, jobID, segModel, clfModel)
	if err != nil {
		d.log().Error("inference server dispatch failed", "job_id", jobID, "error", err)
		if updateErr := d.jobs.UpdateStatus(ctx, jobID, models.JobStatusFailed); updateErr != nil {
			d.log().Warn("failed to mark job failed after dispatch error", "job_id", jobID, "error", updateErr)
		}
		return fmt.Errorf("dispatch: inference server: %w", err)
	}

	refs.InferenceJobID = resp.JobID
	if updateErr := d.jobs.UpdateResultRefs(ctx, jobID, &refs); updateErr != nil {
		d.log().Warn("failed to store inference job id", "job_id", jobID, "error", updateErr)
	}

	if updateErr := d.jobs.UpdateStatus(ctx, jobID, models.JobStatusRunning); updateErr != nil {
		d.log().Warn("failed to mark job running after dispatch", "job_id", jobID, "error", updateErr)
	}

	d.log().Info("job dispatched to inference server",
		"job_id", jobID, "inference_job_id", resp.JobID)
	return nil
}

func (d *Dispatcher) log() *slog.Logger {
	if d.logger == nil {
		return slog.Default()
	}
	return d.logger
}
