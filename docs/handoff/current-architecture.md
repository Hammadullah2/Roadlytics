# Current Architecture

Roadlytics has three main parts:

- `road_pipeline`: geospatial and ML pipeline stages.
- `backend`: FastAPI API, background worker, SQLite metadata, Blob/local storage abstraction, tiling, and reports.
- `frontend`: Next.js static frontend with Dashboard, Projects, Processing, Map Analysis, Reports, and assistant drawers.

## Backend

FastAPI exposes upload, job, artifact, analytics, report, tile, file, and assistant routes. Jobs are tracked in SQLite with:

- `jobs`
- `artifacts`
- `job_events`
- `analytics_snapshots`

The backend can use local filesystem storage or Azure Blob depending on whether `AZURE_STORAGE_CONNECTION_STRING` is configured.

Uploads have a separate transport switch:

```bash
ROADLYTICS_UPLOAD_TRANSPORT=auto
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
```

`auto` uses the storage backend's native upload session. With Azure Blob, that usually means browser-to-Blob SAS upload. `backend_proxy` keeps Azure Blob as durable storage but routes the browser upload through `POST /api/uploads/{upload_id}/file` on FastAPI first, so the browser talks to the same origin and the backend streams the file into Blob.

## Processing

The original worker executes the full pipeline inside the backend container:

1. Download uploaded GeoTIFF.
2. Validate Sentinel-2 shape/georeferencing.
3. Build Sentinel RGB display raster.
4. Run DeepLabV3 or PakOSM segmentation.
5. Run EfficientNet or KMeans condition classification.
6. Run raster-first connectivity analytics.
7. Vectorize road-condition masks into shapefiles.
8. Package artifacts and render HTML report.
9. Register artifacts in SQLite.

The Modal migration adds `ROADLYTICS_PROCESSOR=local|modal`. Local remains the default for development, while the current Azure VM testing setup uses `modal`.

## Frontend

The frontend talks to the backend through `NEXT_PUBLIC_API_BASE_URL`. It uses Leaflet for map overlays. OSM is fixed as the base layer, while Sentinel RGB and Roadlytics result layers are toggleable.

## Storage

Azure Blob remains the intended durable object store for uploads, generated GeoTIFFs, reports, shapefile zips, CSVs, and GeoJSON outputs. Modal inference also reads from and writes to Azure Blob.

The current VM testing default is `ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy` because direct browser-to-Blob upload stalled during the `testing170.tif` test before job creation.

## Tiles

Raster layers are rendered through the backend tile route:

```text
GET /api/jobs/{job_id}/layers/{layer}/{z}/{x}/{y}.png
```

If Leaflet requests a tile outside a raster's bounds, the backend should return a transparent PNG with HTTP `200`, not a `500`. This prevents visible map errors when users pan around the edges of Sentinel/result rasters.

## Reports

Completed jobs expose an HTML report through `/api/jobs/{id}/report`. Blob-only reports are downloaded into the backend work cache on demand if no local report file exists.
