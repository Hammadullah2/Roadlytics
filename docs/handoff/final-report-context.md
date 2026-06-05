# Final Report Context for Claude

This file is the narrative context for turning Roadlytics into a final FYP report. It intentionally explains what changed over time, why decisions were made, and which results are now available from the deployed system.

## Project Purpose

Roadlytics is a web-based road intelligence platform that accepts Sentinel-2 Level-2 GeoTIFF imagery and produces road segmentation, road-condition classification, raster-first network connectivity analytics, interactive map overlays, downloadable artifacts, HTML reports, and a grounded RAG assistant.

The core FYP value is not only the model pipeline. The project productizes a geospatial ML workflow into an application that a non-technical user can operate through a browser:

1. Upload a 4-band Sentinel-2 L2 GeoTIFF in B2, B3, B4, B8 order.
2. Select a road segmentation method: `DeepLabV3` or `PakOSM`.
3. Select a road condition method: `KMeans` or `EfficientNet`.
4. Run inference remotely.
5. View output layers on a map over OpenStreetMap.
6. Download GeoTIFF, shapefile, CSV, GeoJSON, and report artifacts.
7. Ask a grounded assistant to explain the results and limitations.

## Original Pipeline Before Web App Work

The starting point was a stripped-down `road_pipeline` and `notebooks` folder from the original repository. The pipeline was mostly research/CLI oriented. It contained the geospatial and ML logic, but it was not a full user-facing application.

The early project goal was to convert this into a complete web app named Roadlytics, preserving the exact workflow:

- Sentinel-2 image upload.
- Road segmentation.
- Road condition classification.
- Displayable road masks.
- Map-based analysis.
- Downloadable outputs.

## Major Changes During Development

### 1. Product Architecture

Roadlytics was reorganized into three main application areas:

- `road_pipeline`: model and geospatial processing stages.
- `backend`: FastAPI API, SQLite metadata, storage abstraction, background job orchestration, reports, tiles, and assistant routes.
- `frontend`: Next.js static frontend with Dashboard, Projects, Processing, Map Analysis, Reports, and assistant drawer.

### 2. Output Color and Class Semantics

The condition outputs were standardized for report and UI consistency:

- `good`: green.
- `unpaved`: red.
- `damaged`: yellow.
- `combined`: one raster containing all three condition classes.

The important implementation detail is that display colors are user-facing visualization choices, while numeric class values remain internally meaningful for analytics and export.

### 3. Raster-First Connectivity Analytics

Connectivity was added as Stage 5. Instead of depending on shapefile-derived graphs, the deployed analytics operate from the segmentation mask and the combined road-condition raster. This keeps the analytics aligned with the same pixel grid as the ML outputs.

Stage 5 produces:

- `component_map.tif`
- `betweenness_centrality.tif`
- `connected_components.csv`
- `analytics_summary.json`
- `critical_junctions.geojson`

Default traversal is 4-neighbor connectivity. Default road-condition costs are:

- good: `1.0`
- unpaved: `2.0`
- damaged: `3.5`

### 4. Frontend Implementation

The uploaded HTML mockup was converted into a real product shell. The final UI keeps the warm neutral design direction and sidebar information architecture:

- Dashboard
- Projects
- Processing
- Map Analysis
- Reports

Login and admin flows were intentionally omitted for the MVP because the deployed version is no-auth.

### 5. Azure VM Deployment

The first deployment target was an Azure Ubuntu VM because the student subscription was available and the app needed a persistent public web host. Docker Compose was added so the backend, frontend, and Caddy reverse proxy could be deployed consistently.

Azure Blob Storage became the durable object store for:

- uploaded GeoTIFFs
- generated rasters
- generated reports
- shapefile ZIPs
- CSV and GeoJSON analytics files
- Modal progress JSON

### 6. Modal GPU Migration

Azure VM CPU was not ideal for ML inference. The project migrated inference to Modal because Modal provided GPU credits. The VM remains the web host, while Modal runs the heavy processing.

The current split is:

- Azure VM: FastAPI, Next.js static frontend, Caddy, SQLite, API control plane.
- Azure Blob: durable uploads and artifacts.
- Modal: validation, segmentation, classification, connectivity, vectorization, report generation, artifact upload.

Modal app:

```text
roadlytics-inference
```

Modal function:

```text
run_pipeline
```

GPU preference:

```python
["A10", "T4"]
```

### 7. RAG Assistant

A grounded assistant was added after the core application. It is designed to explain Roadlytics results, not replace the analysis. It retrieves from Roadlytics evidence and uses guardrails to avoid unsupported claims.

The assistant can:

- summarize an assessment
- explain selected models
- explain map layers
- explain good/unpaved/damaged/combined masks
- explain connected components and criticality outputs
- interpret reports
- diagnose failed jobs
- compare jobs when a comparison job id is provided
- answer project-library questions from recent job metadata

It uses ChromaDB for retrieval with deterministic local hash embeddings so the VM does not need to download embedding models. Gemini can be used for answer generation when `GEMINI_API_KEY` is configured. Without Gemini, the assistant still returns an extractive fallback answer from retrieved evidence.

Guardrails require the assistant to avoid claiming:

- field-confirmed ground truth
- exact repair costs
- legal compliance
- guaranteed road safety
- emergency routing reliability

## Important Issues Faced and Resolved

### Azure Region and Quota Issues

The student subscription had policy and quota restrictions. Some regions and VM families were unavailable. The final VM ran in East Asia, while the storage account was created in Southeast Asia. The cross-region split works for testing but adds some latency.

### Docker and Local Hardware Constraints

The local machine was not suitable for heavy Docker builds or CPU-bound inference. Docker was used for deployment consistency, but production builds were run on the VM instead of the laptop.

### Caddy Configuration Error

Caddy initially failed because `encode` was placed as a global option incorrectly. Fixing the Caddyfile allowed the reverse proxy to start and route the app publicly.

### Background Worker Stuck at Uploaded

Early jobs stayed at `uploaded` because the background processing path was not being triggered correctly. This was fixed so jobs advance through the lifecycle and failed jobs no longer kill the worker permanently.

### Wrong Input Validation

One early upload failed with:

```text
Sentinel upload must be a 4-band GeoTIFF in B2, B3, B4, B8 order.
```

This validated that the backend correctly rejects unsupported GeoTIFFs before processing.

### Large Raster Connectivity Performance

Full pixel-level graph analytics can become expensive on large rasters. Stage 5 was bounded so large raster criticality could complete without exhausting memory or time.

### Browser Upload Problems

Direct browser-to-Azure SAS upload stalled before job creation. A same-origin backend-proxy upload mode was added. Initial proxy upload used multipart `POST`, but browser requests could remain pending because FastAPI did not enter the handler until multipart parsing completed.

The final fix changed backend-proxy upload to raw streaming:

```text
PUT /api/uploads/{upload_id}/file
```

The frontend now sends the raw TIFF body and shows upload percentage progress. The backend streams bytes to a temporary file and then stores the upload in Azure Blob.

### Map Tile Edge Errors

Leaflet can request tiles outside the raster bounds when users pan around. The tile route now returns transparent PNG `200` responses for out-of-bounds raster tiles instead of server errors.

## Current Live Results

The live app is:

```text
http://52.139.179.111
```

Latest full GPU job observed through the live API:

```text
job_id: 67336c53-0a5b-4b9c-bd98-36315aaf786d
project_name: 1
segmenter: DeepLabV3
classifier: EfficientNet
status: completed
progress: 100
artifact_count: 13
```

Input raster metadata:

```text
width: 4167
height: 2780
band_count: 4
dtype: float32
crs: EPSG:32642
bounds: [445260.0, 3032240.0, 486930.0, 3060040.0]
```

Connectivity analytics summary:

```text
total_road_pixels: 514900
total_components: 1477
isolated_components: 1012
largest_component_pixels: 124014
largest_component_length_km: 1240.14
average_component_pixels: 348.61
mean_component_cost: 823.7627
critical_junctions: 250
critical_threshold: 1.0
criticality_method: local_junction_heuristic
criticality_node_count: 514900
brandes_node_limit: 150000
pixel_size_m: 10.0
```

The latest job registered these 13 artifact categories:

- Sentinel RGB raster
- Road segmentation mask
- Good road mask
- Unpaved road mask
- Damaged road mask
- Combined condition mask
- Connected components raster
- Betweenness centrality raster
- Critical junctions GeoJSON
- Connected components CSV
- Connectivity summary JSON
- Road condition shapefile ZIP
- HTML assessment report

## How To Frame Results in the Final Report

Roadlytics should be presented as an end-to-end applied ML and geospatial system:

- It demonstrates model-driven road extraction and condition mapping from Sentinel-2 imagery.
- It converts model outputs into map-ready GeoTIFF layers and downloadable GIS artifacts.
- It adds raster-first connectivity analytics to move beyond classification into network-level decision support.
- It deploys the workflow as a browser application using FastAPI, Next.js, Docker, Azure Blob, Azure VM, Modal GPU inference, SQLite, Leaflet, and ChromaDB/Gemini-ready RAG.

Do not claim field-validated accuracy unless field validation is actually available. Phrase conclusions as model-derived analysis from uploaded imagery.

## Useful Report Diagrams To Generate

Recommended diagrams for the final report:

- System architecture: browser, Caddy, frontend, FastAPI, SQLite, Azure Blob, Modal GPU, RAG components.
- Processing workflow: upload, validation, segmentation, classification, connectivity, artifact packaging, map/report/RAG.
- User flow: Projects page, processing page, map analysis, reports, assistant.
- Data flow: GeoTIFF to Blob, job metadata to SQLite, artifacts back to Blob, tiles served through FastAPI.
- RAG architecture: query, retrieval sources, ChromaDB, Gemini/fallback generation, guardrails, citations.

## Limitations To State Honestly

- Outputs are not field-confirmed ground truth.
- Sentinel-2 resolution limits fine road detail.
- PakOSM depends on available OSM road data quality.
- DeepLabV3 and EfficientNet quality depends on training data and domain match.
- Connectivity analytics are raster-derived approximations.
- Critical junctions are decision-support hotspots, not guaranteed operational choke points.
- The current MVP has no authentication.
- SQLite is acceptable for the MVP but should be replaced or hardened for multi-user production.
