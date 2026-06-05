# Current State and Next Steps

## Current Working State

- Repository: `https://github.com/Hammadullah2/Roadlytics`
- Local repo: `C:\Users\hammad\Roadlytics`
- Active branch: `codex/modal-inference-migration`
- Live app: `http://52.139.179.111`
- Azure VM path: `/opt/roadlytics`
- Modal app: `roadlytics-inference`
- Modal function: `run_pipeline`
- Modal GPU preference: `A10`, fallback `T4`
- Current purpose of these docs: handoff to Claude or another assistant for final report generation, demo preparation, and project explanation.

Do not overwrite local changes without inspecting them. Also do not expose Azure Blob credentials, Modal tokens, Gemini keys, or signed artifact URLs in reports, screenshots, docs, or commits.

## Already Implemented

- Phase 1 web app with FastAPI, Next.js, Docker Compose, SQLite, Azure Blob, OSM basemap, Leaflet overlays, HTML reports, and RAG assistant.
- Modal inference path with `ROADLYTICS_PROCESSOR=modal`.
- RAG assistant routes and UI, with Gemini support when `GEMINI_API_KEY` is set and local extractive fallback when it is not.
- Modal app deployed as `roadlytics-inference`.
- Modal smoke test `PakOSM + KMeans` completed successfully with 13 artifacts and registered map layers.
- Full GPU test `DeepLabV3 + EfficientNet` completed successfully with 13 artifacts.
- Backend worker no longer dies after a failed job.
- Stage 5 connectivity has a bounded large-raster criticality path.
- Raster tiles outside dataset bounds return transparent PNG `200` instead of `500`.
- Browser upload now uses raw streaming backend-proxy `PUT` for reliability and visible upload progress.

## Live VM Environment To Preserve

The VM should keep:

```bash
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_MODAL_APP=roadlytics-inference
ROADLYTICS_MODAL_FUNCTION=run_pipeline
ROADLYTICS_MODAL_ENVIRONMENT=main
ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS=10
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
NEXT_PUBLIC_API_BASE_URL=http://52.139.179.111
```

Optional RAG generation:

```bash
GEMINI_API_KEY=
ROADLYTICS_ASSISTANT_MODEL=gemini-2.5-flash
ROADLYTICS_ASSISTANT_CHROMA_PATH=/app/backend/data/chroma
ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS=18000
```

## Current Live Results

Latest completed full GPU job observed from the live API:

```text
job_id: 67336c53-0a5b-4b9c-bd98-36315aaf786d
project_name: 1
segmenter: DeepLabV3
classifier: EfficientNet
status: completed
progress: 100
artifact_count: 13
created_at: 2026-06-05T17:37:14Z
completed_at: 2026-06-05T17:39:44Z
```

Raster metadata:

```text
width: 4167
height: 2780
band_count: 4
dtype: float32
crs: EPSG:32642
bounds: [445260.0, 3032240.0, 486930.0, 3060040.0]
```

Connectivity summary:

```text
total_road_pixels: 514900
total_components: 1477
isolated_components: 1012
largest_component_pixels: 124014
largest_component_length_km: 1240.14
average_component_pixels: 348.61
mean_component_cost: 823.7627
critical_junctions: 250
criticality_method: local_junction_heuristic
pixel_size_m: 10.0
```

Artifact set:

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

## Important History

Roadlytics began as a research/CLI style pipeline. It was converted into a deployed web application with:

- model selection
- browser upload
- asynchronous processing
- Modal GPU inference
- Azure Blob artifact persistence
- tile serving
- map overlays
- reports
- RAG explanation assistant

Major mid-project changes:

- Azure VM remained the web host, but inference moved to Modal for GPU access.
- Direct Azure SAS upload stalled during browser testing, so upload moved to backend proxy mode.
- Multipart backend-proxy upload also behaved poorly for large TIFFs, so the final proxy uses raw `PUT` streaming.
- Map tiles outside raster bounds now return transparent tiles, preventing map UI errors around image edges.
- Stage 5 connectivity was bounded for larger rasters so criticality analytics can complete.

## Recommended Next Work

1. Use `docs/handoff/final-report-context.md` as the main input for the final report.
2. Use `docs/handoff/rag-testing-suite.md` to test the assistant from the completed report/map pages.
3. Capture screenshots of the completed job: Projects list, Processing completed state, Map Analysis layers, Reports page, and RAG assistant answers.
4. Make sure the final report states limitations honestly: model-derived outputs, no field validation, Sentinel-2 resolution limits, and raster-derived connectivity approximations.
5. If a custom domain or HTTPS is needed, add it later; the current live demo uses the VM public IP.
