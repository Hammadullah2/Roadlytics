# Goroutine Orchestration Architecture

## Overview

The orchestrator manages all background goroutines. Each goroutine receives a
`context.Context` for graceful cancellation and a `sync.WaitGroup` for shutdown coordination.

The model processes results in **3 sequential stages** (segmentation → classification →
connectivity), writing to Supabase DB after each stage. Our goroutines monitor these
writes and push real-time updates to the frontend.

## Goroutine Map

```
                    Orchestrator.Start(ctx)
                           │
              ┌────────────┼────────────────────┐
              │            │                    │
              ▼            ▼                    ▼
     ┌────────────┐ ┌──────────────┐  ┌──────────────────┐
     │ Ingestion  │ │  Progress    │  │   Evaluation     │
     │ Group      │ │  Group       │  │   Group          │
     └────┬───────┘ └──────┬───────┘  └────────┬─────────┘
          │                │                    │
    ┌─────┴─────┐    ┌─────┴──────┐      ┌─────┴──────┐
    │           │    │           │      │           │
    ▼           ▼    ▼           ▼      ▼           ▼
 Model      Queue  Progress  UIPush  JobListener ResultParser
 Dispatcher Monitor Poller   Service              │
                                                   ▼
                                              DataFinalizer
                                                   │
                                            ┌──────┴──────┐
                                            ▼             ▼
                                       StateSwitcher  FrontendAlerter
```

## Pipeline: How Streaming Results Work

The model writes to Supabase in 3 stages. Our goroutines detect each stage:

```
Model writes segmentation_results (progress 0-33%)
    │
    ├── ProgressPoller detects progress change
    │   └── UIPushService → WebSocket → frontend progress bar
    │
    ├── JobListener detects segmentation_results row exists
    │   └── FrontendAlerter → "Segmentation complete, map layer available"
    │
Model writes classification_results (progress 33-66%)
    │
    ├── ProgressPoller detects progress change
    │   └── UIPushService → WebSocket → frontend progress bar
    │
    ├── JobListener detects classification_results rows exist
    │   └── FrontendAlerter → "Classification complete, condition layer available"
    │
Model writes connectivity_graphs (progress 66-100%)
    │
    ├── ProgressPoller detects progress change
    │   └── UIPushService → WebSocket → frontend progress bar
    │
    ├── JobListener detects jobs.status = 'completed'
    │   └── ResultParser validates all data
    │       └── DataFinalizer marks job as fully processed
    │           └── FrontendAlerter → "All stages complete"
```

This means the frontend can render **partial results** as they arrive:
- After Stage 1: show road segments on map (segmentation layer)
- After Stage 2: color-code segments by condition (classification layer)
- After Stage 3: show connectivity graph overlay (connectivity layer)

## Goroutine Details

### 1. ModelDispatcher
- **Trigger**: Polls `jobs` table every 10 seconds for `status = 'pending'`
- **Action**: Updates job to `running`, ensures GeoJSON file is accessible in Supabase Storage
- **Note**: The model polls Supabase for running jobs. This goroutine just handles the status transition and any prep work.
- **Error**: Sets job to `failed` with error_message if dispatch fails

### 2. QueueMonitor
- **Trigger**: Ticker every 5 minutes
- **Action**: Finds jobs stuck in `running` for > 15 minutes, marks as `failed`
- **Logging**: Creates log entry for each stuck job

### 3. ProgressPoller
- **Trigger**: Ticker every 30 seconds (for active jobs only)
- **Action**: Reads `jobs.progress` from DB (model updates progress directly)
- **Output**: Passes progress data to UIPushService via channel

### 4. UIPushService
- **Trigger**: Receives progress/stage updates from channels
- **Action**: Broadcasts to all connected WebSocket clients for that job
- **Messages**:
  ```json
  { "type": "progress", "job_id": "...", "progress": 54 }
  { "type": "stage_complete", "job_id": "...", "stage": "segmentation" }
  { "type": "stage_complete", "job_id": "...", "stage": "classification" }
  { "type": "job_complete", "job_id": "..." }
  ```

### 5. JobListener
- **Trigger**: Polls DB every 10 seconds
- **Detects**:
  - New `segmentation_results` row → stage 1 complete
  - New `classification_results` rows → stage 2 complete
  - `jobs.status = 'completed'` → all stages done
- **Output**: Sends stage completion events to UIPushService + ResultParser

### 6. ResultParser
- **Trigger**: Receives completed job from JobListener
- **Action**: Validates GeoJSON structure matches contract spec
- **Checks**:
  - All features have required fields (segment_id, coordinates)
  - road_label is one of: Good, Damaged, Unpaved
  - confidence is between 0.0 and 1.0
  - Coordinates are valid WGS84
- **Error**: Logs validation errors but doesn't fail the job (model already completed)

### 7. DataFinalizer
- **Trigger**: Receives validated data from ResultParser
- **Action**: Marks job as fully processed in internal tracking

### 8. StateSwitcher + FrontendAlerter
- **Trigger**: Stage completions and final job completion
- **Action**: Sends WebSocket notifications for each stage

## Channel Architecture

```go
type Orchestrator struct {
    progressCh chan JobProgress    // ProgressPoller → UIPushService
    stageCh    chan StageComplete  // JobListener → UIPushService + ResultParser
    completeCh chan string         // DataFinalizer → FrontendAlerter
}

type JobProgress struct {
    JobID    string
    Progress int
}

type StageComplete struct {
    JobID string
    Stage string  // "segmentation", "classification", "connectivity"
}
```

## Graceful Shutdown

```
SIGINT / SIGTERM received
        │
        ▼
  ctx.Cancel()  ────▶  All goroutines check ctx.Done()
        │
        ▼
  wg.Wait()     ────▶  Block until all goroutines exit
        │
        ▼
  Close channels (progressCh, stageCh, completeCh)
        │
        ▼
  Close WebSocket hub
        │
        ▼
  Drain HTTP server (30s timeout)
        │
        ▼
  Close DB pool
        │
        ▼
  Exit
```
