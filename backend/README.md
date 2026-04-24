# Roadlytics Backend

FastAPI backend for the Phase 1 Roadlytics web application.

## What it does

- Initializes direct upload sessions for Sentinel-2 GeoTIFF inputs
- Creates and tracks processing jobs in SQLite
- Runs segmentation, condition classification, Stage 5 connectivity analytics, and packaging
- Publishes GeoTIFF, GeoJSON, CSV, ZIP, and HTML report artifacts
- Serves TileJSON and PNG tile endpoints for the map UI

## Key paths

- API entry point: `backend/app/main.py`
- Job orchestration: `backend/app/services/jobs.py`
- Worker queue: `backend/app/services/worker.py`
- Storage backends: `backend/app/storage/backends.py`

## Environment

Copy `backend/.env.example` into your runtime environment and set the values you need.

- Leave `AZURE_STORAGE_CONNECTION_STRING` empty to use local file storage under `backend/data/storage`
- Set `AZURE_STORAGE_CONNECTION_STRING` and `AZURE_STORAGE_CONTAINER` to switch uploads and artifacts to Azure Blob
- `ROADLYTICS_MODEL_WEIGHTS_DIR` defaults to `/app/model_weights` in Docker
- `ROADLYTICS_OSM_DIR` defaults to `/app/data/osm_roads` in Docker
- `ROADLYTICS_SEG_WEIGHTS` and `ROADLYTICS_CLS_WEIGHTS` can override exact weight files if needed

## Run locally

From the repo root:

```bash
pip install -r road_pipeline/requirements.txt
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

## Test

From the repo root:

```bash
pytest
```

## Docker

From the repo root:

```bash
docker compose build
docker compose up -d
```

The backend container expects:

- model weights in `model_weights/`
- Pakistan OSM roads shapefile set in `data/osm_roads/`

