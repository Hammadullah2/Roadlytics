# Current Architecture

Roadlytics has three main code areas:

- `road_pipeline`: geospatial and ML pipeline stages.
- `backend`: FastAPI API, background worker, SQLite metadata, Blob/local storage abstraction, tiling, reports, and RAG assistant routes.
- `frontend`: Next.js static frontend with Dashboard, Projects, Processing, Map Analysis, Reports, and assistant drawer.

The live deployment uses Azure VM as the web host, Azure Blob as durable storage, and Modal as the GPU inference host.

## Runtime Architecture

```text
Browser
  |
  | HTTP
  v
Caddy on Azure VM
  |
  +--> Next.js static frontend container
  |
  +--> FastAPI backend container
          |
          +--> SQLite metadata
          +--> Azure Blob uploads/artifacts
          +--> Modal GPU function for processing
          +--> ChromaDB-backed assistant retrieval
```

## Backend

FastAPI exposes upload, job, artifact, analytics, report, tile, file, and assistant routes. Jobs are tracked in SQLite with:

- `jobs`
- `artifacts`
- `job_events`
- `analytics_snapshots`

The backend can use local filesystem storage or Azure Blob depending on whether `AZURE_STORAGE_CONNECTION_STRING` is configured.

## Upload Transport

Uploads have a separate transport switch:

```bash
ROADLYTICS_UPLOAD_TRANSPORT=auto
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
```

`auto` uses the storage backend's native upload session. With Azure Blob, that usually means browser-to-Blob SAS upload.

`backend_proxy` keeps Azure Blob as durable storage but routes the browser upload through FastAPI first, so the browser talks to the same origin as the app. The current production-like path uses raw streaming:

```text
PUT /api/uploads/{upload_id}/file
Content-Type: image/tiff
Body: raw GeoTIFF bytes
```

The frontend sends the raw `File` object through XHR and shows upload percentage progress. The backend streams incoming bytes into a temporary file and then uploads that file to Azure Blob.

This replaced the earlier multipart `POST` proxy. Multipart was harder to debug because FastAPI/Starlette did not enter the handler until form parsing completed, which made large pending uploads look like backend silence.

## Processing

Roadlytics supports two processing modes:

```bash
ROADLYTICS_PROCESSOR=local
ROADLYTICS_PROCESSOR=modal
```

Local mode runs the original pipeline inside the backend container. Modal mode submits processing to the deployed Modal function.

The pipeline stages are:

1. Validate uploaded Sentinel-2 GeoTIFF.
2. Build Sentinel RGB display raster.
3. Run road segmentation using `DeepLabV3` or `PakOSM`.
4. Run road condition classification using `KMeans` or `EfficientNet`.
5. Generate per-class and combined condition masks.
6. Run raster-first connectivity analytics.
7. Vectorize condition masks into shapefiles.
8. Package artifacts and render HTML report.
9. Register artifact metadata in SQLite.

## Storage

Azure Blob stores:

- uploaded input GeoTIFFs
- generated Sentinel RGB rasters
- road segmentation rasters
- good/unpaved/damaged/combined condition rasters
- connected component and betweenness rasters
- critical junction GeoJSON
- connected component CSV
- analytics summary JSON
- shapefile ZIPs
- HTML reports
- Modal progress JSON

Modal reads the uploaded GeoTIFF from Blob and writes outputs back to Blob. The backend registers returned artifact metadata in SQLite.

## Frontend

The frontend talks to the backend through `NEXT_PUBLIC_API_BASE_URL`. It uses Leaflet for map overlays.

OSM is fixed as the base layer. Toggleable Roadlytics overlays include:

- Sentinel RGB
- Road segmentation
- Combined condition mask
- Good roads
- Unpaved roads
- Damaged roads
- Connected components
- Betweenness criticality
- Critical junctions

## Tiles

Raster layers are rendered through the backend tile route:

```text
GET /api/jobs/{job_id}/layers/{layer}/{z}/{x}/{y}.png
```

If Leaflet requests a tile outside a raster's bounds, the backend returns a transparent PNG with HTTP `200`, not a `500`. This prevents visible map errors when users pan around Sentinel/result raster edges.

## Reports

Completed jobs expose an HTML report through:

```text
GET /api/jobs/{id}/report
```

Blob-only reports are downloaded into the backend work cache on demand if no local report file exists.

## RAG Assistant

The assistant is backend-driven and exposed through:

```text
POST /api/assistant/chat
GET /api/assistant/suggestions
POST /api/assistant/reindex
```

It retrieves from static Roadlytics notes, job metadata, job events, artifact manifests, analytics snapshots, generated report text, visible map layers, and viewport context. It uses ChromaDB with local hash embeddings. Generation can use Gemini or an OpenAI-compatible provider such as Groq/OpenRouter when configured; otherwise it returns extractive fallback answers.
