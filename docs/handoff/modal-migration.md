# Modal Migration Context

Roadlytics is being migrated so inference and geospatial processing can run on Modal GPUs while the FastAPI/frontend control plane stays mostly unchanged.

## Chosen Split

Modal owns inference/processing only:

- FastAPI still handles uploads, job creation, job status, artifacts, analytics, reports, map tiles, and assistant routes.
- Azure Blob remains the object store.
- Modal downloads uploaded GeoTIFFs from Azure Blob and uploads generated artifacts back to Azure Blob.

## Backend Switch

Set:

```bash
ROADLYTICS_PROCESSOR=modal
```

Keep:

```bash
ROADLYTICS_PROCESSOR=local
```

for the original in-container worker.

## Modal Runtime Pieces

The Modal app is in:

```text
modal_app/roadlytics_modal.py
```

It defines:

- Modal app: `roadlytics-inference`
- Function: `run_pipeline`
- Volume: `roadlytics-assets`
- Secret: `roadlytics-azure`
- GPU fallback: `["A10", "T4"]`
- `max_containers=1` for cost safety

## Manual Modal Setup

```powershell
pip install modal
modal setup
modal volume create roadlytics-assets
modal volume put roadlytics-assets model_weights /model_weights
modal volume put roadlytics-assets data/osm_roads /osm_roads
modal secret create roadlytics-azure `
  AZURE_STORAGE_CONNECTION_STRING="..." `
  AZURE_STORAGE_CONTAINER="roadlytics"
modal deploy modal_app/roadlytics_modal.py
```

Backend environment when enabling Modal:

```bash
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_MODAL_APP=roadlytics-inference
ROADLYTICS_MODAL_FUNCTION=run_pipeline
ROADLYTICS_MODAL_ENVIRONMENT=main
ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS=10
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
```

## Data Flow

1. User uploads GeoTIFF to Azure Blob through the existing upload flow.
2. Backend creates a queued job in SQLite.
3. Worker sees `ROADLYTICS_PROCESSOR=modal`.
4. Backend invokes `modal.Function.from_name(...).spawn(payload)`.
5. Modal downloads the input from Azure Blob.
6. Modal runs validation, segmentation, classification, connectivity, vectorization, and report generation.
7. Modal uploads artifacts to Azure Blob.
8. Modal writes progress JSON at `jobs/{job_id}/modal/progress.json`.
9. Backend polls progress JSON and mirrors stages/events into SQLite.
10. Modal returns artifact metadata and analytics summary.
11. Backend registers artifacts and marks the job completed.

## First Smoke Test

Use a small clipped Sentinel-2 GeoTIFF.

Recommended sequence:

1. `PakOSM + KMeans` to validate Blob, OSM, geospatial, packaging, and report flow cheaply.
2. `DeepLabV3 + EfficientNet` to validate GPU, PyTorch, and weights.

## Known Risks

- Modal image build may be heavy because geospatial dependencies and PyTorch are large.
- The first Modal cold start will be slow.
- Very large GeoTIFFs can consume free credits quickly.
- If `roadlytics-assets` is missing weights or OSM shapefiles, jobs will fail inside Modal.
- If the backend does not have `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, it cannot invoke the deployed Modal function.
