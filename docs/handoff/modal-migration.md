# Modal Migration Context

Roadlytics has been migrated so inference and geospatial processing can run on Modal GPUs while the FastAPI/frontend control plane stays on the Azure VM.

## Current Status

Modal migration is implemented and deployed.

Completed validation:

- `PakOSM + KMeans` smoke test completed through Modal with 13 artifacts.
- `DeepLabV3 + EfficientNet` full GPU test completed through Modal with 13 artifacts.
- The latest full GPU job completed on 2026-06-05 with job id `67336c53-0a5b-4b9c-bd98-36315aaf786d`.

## Chosen Split

Modal owns inference and processing only:

- FastAPI still handles uploads, job creation, job status, artifacts, analytics, reports, map tiles, and assistant routes.
- Azure Blob remains the object store.
- Modal downloads uploaded GeoTIFFs from Azure Blob and uploads generated artifacts back to Azure Blob.
- SQLite on the VM remains the metadata store for the MVP.

## Backend Switch

Set:

```bash
ROADLYTICS_PROCESSOR=modal
```

Use local mode only for development:

```bash
ROADLYTICS_PROCESSOR=local
```

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

Current GPU configuration:

```python
gpu=["A10", "T4"]
```

## Data Flow

1. User uploads GeoTIFF through the Roadlytics web app.
2. Backend stores the input under Azure Blob `uploads/{upload_id}/input.tif`.
3. Backend creates a queued job in SQLite.
4. Worker sees `ROADLYTICS_PROCESSOR=modal`.
5. Backend invokes `modal.Function.from_name(...).spawn(payload)`.
6. Modal downloads the input from Azure Blob.
7. Modal runs validation, segmentation, classification, connectivity, vectorization, and report generation.
8. Modal uploads artifacts to Azure Blob.
9. Modal writes progress JSON at `jobs/{job_id}/modal/progress.json`.
10. Backend polls progress JSON and mirrors stages/events into SQLite.
11. Modal returns artifact metadata and analytics summary.
12. Backend registers artifacts and marks the job completed.

## Manual Modal Setup Reference

These steps have already been completed in the current environment. Keep them as recovery/reference commands only.

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

Do not commit or paste actual tokens.

## Known Risks and Limitations

- Modal image builds are heavy because geospatial dependencies and PyTorch are large.
- The first Modal cold start may be slow.
- Very large GeoTIFFs can consume free credits quickly.
- If the Modal volume is missing model weights or OSM shapefiles, jobs will fail inside Modal.
- If the backend lacks `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, it cannot invoke the deployed function.
- The current VM remains a temporary web host using a public IP rather than custom-domain HTTPS.
