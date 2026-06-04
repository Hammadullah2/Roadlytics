# Roadlytics Modal Inference

This folder contains the Modal app used to run Roadlytics inference and geospatial processing on Modal GPUs while keeping the existing FastAPI/frontend app as the control plane.

## Manual Setup

Install and authenticate Modal locally:

```powershell
pip install modal
modal setup
```

Create the asset volume:

```powershell
modal volume create roadlytics-assets
modal volume put roadlytics-assets model_weights /model_weights
modal volume put roadlytics-assets data/osm_roads /osm_roads
```

Create the Azure Blob secret:

```powershell
modal secret create roadlytics-azure `
  AZURE_STORAGE_CONNECTION_STRING="your-connection-string" `
  AZURE_STORAGE_CONTAINER="roadlytics"
```

Deploy from the repository root:

```powershell
modal deploy modal_app/roadlytics_modal.py
```

## Backend Runtime Switch

Set these variables on the backend when you want jobs to run on Modal:

```bash
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_MODAL_APP=roadlytics-inference
ROADLYTICS_MODAL_FUNCTION=run_pipeline
ROADLYTICS_MODAL_ENVIRONMENT=main
ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS=10
MODAL_TOKEN_ID=your-modal-token-id
MODAL_TOKEN_SECRET=your-modal-token-secret
```

Leave `ROADLYTICS_PROCESSOR=local` to keep the current in-container worker behavior.

## Notes

- Uploads and artifacts remain in Azure Blob.
- Model weights and PakOSM shapefiles are read from the Modal Volume.
- The backend polls `jobs/{job_id}/modal/progress.json` in Blob to mirror Modal progress into SQLite.
- The Modal function is capped with `max_containers=1` by default to protect free credits during testing.
