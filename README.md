# Roadlytics

Roadlytics is a web-based road intelligence platform that processes Sentinel-2 Level-2 GeoTIFF imagery to produce road segmentation, road-condition masks, raster-first connectivity analytics, interactive map overlays, downloadable GIS artifacts, HTML reports, and a grounded AI assistant.

The application was built as an end-to-end Final Year Project: a research-style geospatial/ML road analysis pipeline was converted into a deployed browser application with model selection, background processing, cloud storage, GPU inference, map analysis, reporting, and Retrieval-Augmented Generation (RAG) explanations.

## What Roadlytics Does

Roadlytics accepts a 4-band Sentinel-2 L2 GeoTIFF in `B2, B3, B4, B8` order and runs the following workflow:

1. Upload Sentinel-2 GeoTIFF.
2. Choose a road segmentation method: `DeepLabV3` or `PakOSM`.
3. Choose a road-condition classifier: `KMeans` or `EfficientNet`.
4. Generate a road segmentation GeoTIFF.
5. Generate road-condition GeoTIFF layers:
   - `good`: green
   - `unpaved`: red
   - `damaged`: yellow
   - `combined`: all three road-condition classes in one raster
6. Run raster-first connectivity analytics.
7. Display outputs on an interactive map over a fixed OpenStreetMap base layer.
8. Export GeoTIFF, GeoJSON, CSV, ZIP, and HTML report artifacts.
9. Use the Roadlytics assistant to explain results, limitations, layers, reports, and failures.

## Key Features

- Browser-based upload and assessment creation.
- Model selection for segmentation and road-condition classification.
- Dockerized FastAPI backend and Next.js frontend.
- Azure Blob storage support for uploads and generated artifacts.
- Modal GPU inference support for ML/geospatial processing.
- SQLite metadata store for MVP job tracking.
- Leaflet map analysis with fixed OSM base layer and toggleable raster/vector overlays.
- Tile endpoint for Sentinel RGB, segmentation, condition masks, connected components, and betweenness criticality.
- HTML report generation for completed assessments.
- RAG assistant powered by ChromaDB retrieval and an optional LLM provider.
- Safe local fallback assistant when the external LLM is unavailable.

## System Architecture

```text
Browser
  |
  | HTTP
  v
Caddy / Reverse Proxy
  |
  +--> Next.js static frontend
  |
  +--> FastAPI backend
          |
          +--> SQLite metadata
          +--> Azure Blob uploads and artifacts
          +--> Modal GPU inference function
          +--> ChromaDB assistant retrieval
```

The default cloud deployment uses the VM as the control plane and Modal as the inference plane:

- Azure VM: FastAPI, frontend, Caddy, SQLite, worker orchestration.
- Azure Blob: uploaded GeoTIFFs, generated rasters, reports, CSVs, shapefile ZIPs, and GeoJSON.
- Modal: GPU-backed pipeline execution.
- OpenStreetMap: fixed public base map.

## Repository Structure

```text
backend/          FastAPI API, job orchestration, storage, tiling, reports, RAG
frontend/         Next.js static frontend and Leaflet UI
road_pipeline/    Geospatial and ML pipeline stages
modal_app/        Modal GPU inference app
deploy/azure/     Azure VM compose/Caddy deployment files
data/osm_roads/   PakOSM road shapefile assets
notebooks/        Research and experimentation notebooks
tests/            Unit/integration tests
docker-compose.yml
```

## Processing Pipeline

### 1. Upload Validation

The backend validates that the uploaded raster is a GeoTIFF with exactly four bands in the expected Sentinel-2 order:

```text
B2, B3, B4, B8
```

It also checks georeferencing metadata so outputs can align on the map.

### 2. Road Segmentation

Roadlytics supports two segmentation methods:

- `DeepLabV3`: learned road segmentation from Sentinel-2 imagery.
- `PakOSM`: rasterizes Pakistan OSM road geometries onto the uploaded GeoTIFF grid.

The segmentation output is a GeoTIFF road mask.

### 3. Road-Condition Classification

Roadlytics supports two condition methods:

- `KMeans`: unsupervised condition grouping based on image features.
- `EfficientNet`: learned road-condition classification.

The classifier generates per-class road-condition rasters plus a combined condition raster.

### 4. Connectivity Analytics

Roadlytics runs raster-first network analytics using the segmentation mask and combined condition raster.

Outputs:

- `component_map.tif`
- `betweenness_centrality.tif`
- `connected_components.csv`
- `analytics_summary.json`
- `critical_junctions.geojson`

Default condition traversal weights:

```text
good = 1.0
unpaved = 2.0
damaged = 3.5
```

Default connectivity rule:

```text
4-neighbor raster connectivity
```

### 5. Artifact Packaging

Completed jobs register downloadable outputs in the backend database and object storage:

- Sentinel RGB raster
- segmentation mask
- good road mask
- unpaved road mask
- damaged road mask
- combined condition mask
- connected components raster
- betweenness criticality raster
- critical junctions GeoJSON
- connected components CSV
- analytics summary JSON
- road-condition shapefile ZIP
- HTML assessment report

## Map Layers

OpenStreetMap is the fixed base layer. Roadlytics overlays are toggleable:

- Sentinel RGB
- Road Segmentation
- Combined Condition Mask
- Good Roads
- Unpaved Roads
- Damaged Roads
- Connected Components
- Betweenness Criticality
- Critical Junctions

Tiles outside raster bounds return transparent PNG responses to avoid map errors when panning near raster edges.

## RAG Assistant

Roadlytics includes a grounded assistant for explaining job outputs, map layers, reports, analytics, and failures.

The assistant retrieves evidence from:

- static method notes
- layer glossary
- guardrail notes
- job metadata
- job event timeline
- artifact manifest
- analytics summary
- generated report text
- visible map layer context

ChromaDB is used for retrieval with deterministic local hash embeddings, keeping deployment lightweight. The answer generator can use Gemini or an OpenAI-compatible provider such as OpenRouter/Groq. If the external provider is unavailable, Roadlytics falls back to a local evidence-based summary.

The assistant is constrained not to claim:

- field-confirmed ground truth
- exact repair cost
- legal compliance
- guaranteed road safety
- emergency routing reliability

## Prerequisites

- Docker and Docker Compose
- Python 3.11+
- Node.js 22+ if running the frontend outside Docker
- Azure Storage account if using Azure Blob
- Modal account if using GPU inference
- Optional LLM API key for assistant generation

## Required Runtime Assets

Model weights are intentionally not committed to Git. Place them in:

```text
model_weights/
```

Expected filenames used in the current demo setup:

```text
model_weights/road segmentation.pth
model_weights/road_condition_model.pth
```

PakOSM also expects Pakistan OSM roads data under:

```text
data/osm_roads/
```

The large shapefile components are intentionally not committed. Keep `data/osm_roads/README.md` in the repo, then place the `.shp`, `.dbf`, `.shx`, `.prj`, and `.cpg` files locally or fetch them during deployment.

## Environment Variables

Create a local `.env` file or edit the deployment env file used by Docker Compose.

Core settings:

```env
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER=roadlytics
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
ROADLYTICS_PROCESSOR=local
ROADLYTICS_WORKER_CONCURRENCY=1
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_BASEMAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Modal settings:

```env
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_MODAL_APP=roadlytics-inference
ROADLYTICS_MODAL_FUNCTION=run_pipeline
ROADLYTICS_MODAL_ENVIRONMENT=main
ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS=10
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
```

Assistant settings with OpenRouter:

```env
ROADLYTICS_ASSISTANT_PROVIDER=openai_compatible
ROADLYTICS_ASSISTANT_API_KEY=
ROADLYTICS_ASSISTANT_BASE_URL=https://openrouter.ai/api/v1
ROADLYTICS_ASSISTANT_MODEL=openrouter/free
ROADLYTICS_ASSISTANT_CHROMA_PATH=/app/backend/data/chroma
ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS=18000
```

Assistant settings with Gemini:

```env
ROADLYTICS_ASSISTANT_PROVIDER=gemini
GEMINI_API_KEY=
ROADLYTICS_ASSISTANT_MODEL=gemini-2.5-flash
ROADLYTICS_ASSISTANT_EMBEDDING_MODEL=gemini-embedding-001
```

Do not commit secrets, API keys, SAS URLs, Azure connection strings, or Modal tokens.

## Run With Docker

From the repository root:

```bash
docker compose build
docker compose up -d
```

Open:

```text
http://localhost:3000
```

Backend health check:

```bash
curl http://localhost:8000/api/health
```

## Run Backend Locally

```bash
pip install -r backend/requirements.txt
pip install -r road_pipeline/requirements.txt
uvicorn backend.app.main:app --reload
```

## Run Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

## Modal Inference Setup

Install and authenticate Modal:

```bash
pip install modal
modal setup
```

Create the Modal volume and upload runtime assets:

```bash
modal volume create roadlytics-assets
modal volume put roadlytics-assets model_weights /model_weights
modal volume put roadlytics-assets data/osm_roads /osm_roads
```

Create the Azure secret:

```bash
modal secret create roadlytics-azure \
  AZURE_STORAGE_CONNECTION_STRING="your-connection-string" \
  AZURE_STORAGE_CONTAINER="roadlytics"
```

Deploy:

```bash
modal deploy modal_app/roadlytics_modal.py
```

## API Overview

Main API endpoints:

```text
POST /api/uploads/init
PUT  /api/uploads/{upload_id}/file
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/{job_id}
GET  /api/jobs/{job_id}/artifacts
GET  /api/jobs/{job_id}/analytics
GET  /api/jobs/{job_id}/report
GET  /api/jobs/{job_id}/layers/{layer}/tilejson.json
GET  /api/jobs/{job_id}/layers/{layer}/{z}/{x}/{y}.png
POST /api/assistant/chat
```

## Testing

Run backend and pipeline tests:

```bash
pytest
```

Useful manual acceptance checks:

- Upload a valid 4-band Sentinel-2 GeoTIFF.
- Confirm job progresses through validation, segmentation, classification, connectivity, packaging, and completed.
- Confirm all 13 artifact categories are registered.
- Open Map Analysis and toggle each overlay.
- Confirm good roads are green, unpaved roads are red, and damaged roads are yellow.
- Confirm report page renders.
- Ask the assistant to summarize the job and explain connectivity metrics.

## Known Limitations

- Outputs are model-derived decision support, not field-confirmed ground truth.
- Sentinel-2 spatial resolution limits fine road detail.
- PakOSM depends on OSM data quality and coverage.
- Model performance depends on training data and domain match.
- Raster-first connectivity approximates network behavior from pixels.
- The MVP uses SQLite and no authentication.
- Free LLM providers may rate-limit; the assistant falls back to local evidence summaries.

## License and Attribution

OpenStreetMap tiles and map data are used according to OpenStreetMap attribution requirements.

Add project-specific license details before distributing Roadlytics publicly.
