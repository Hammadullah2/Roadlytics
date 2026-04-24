# AI-Driven Road Quality Assessment — Inference Server

Complete end-to-end pipeline for automated road condition classification using Sentinel-2 satellite imagery fetched via SentinelHub API. Implements 6-stage deep learning pipeline (P1–P6) with U-Net segmentation, EfficientNet classification, and NetworkX connectivity analysis.

## Features

- **Sentinel-2 Integration**: Automatic AOI-based imagery fetch with cloud cover filtering
- **6-Stage Pipeline**: Preprocessing → Segmentation → Classification → Graph Analysis → Report Generation
- **Deep Learning**: U-Net for road detection, EfficientNet-B0 for condition classification
- **Real-time Progress**: WebSocket events stream job progress to client
- **Async Execution**: Celery + Redis for distributed inference
- **Complete Outputs**: PDF reports, GeoJSON/Shapefile vectors, connectivity graphs

## Project Structure

```
inference_server/
├── __init__.py
├── config.py                    # Environment configuration
├── models.py                    # Model loaders
├── sentinelhub_fetcher.py       # SentinelHub API client
├── pipeline.py                  # Main orchestrator
├── api.py                       # FastAPI + WebSocket + Celery
├── stages/
│   ├── __init__.py
│   ├── preprocess.py            # P1–P2: validation, reprojection, normalisation
│   ├── segment.py               # P3: U-Net road segmentation
│   ├── classify.py              # P4: EfficientNet condition classification
│   ├── graph.py                 # P5: NetworkX connectivity
│   └── report.py                # P6: PDF + map generation
├── requirements.txt
├── Dockerfile
├── .env.example
├── run_server.py                # Dev entrypoint
└── README.md
```

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Prepare artifact files

Place trained models in `artifacts/`:
```
artifacts/
├── unet.pth                     (PyTorch U-Net state dict, ~90 MB)
├── efficientnet.pth             (PyTorch EfficientNet state dict, ~16 MB)
├── pipeline_config.pkl          (Hyperparameters + thresholds)
└── class_weights.pkl            (Classification metadata)
```

### 3. Configure environment

Copy `.env.example` to `.env` and fill in SentinelHub credentials:

```bash
cp .env.example .env
```

Then edit `.env`:
```bash
SH_CLIENT_ID=<your-client-id>
SH_CLIENT_SECRET=<your-client-secret>
ARTIFACTS_DIR=./artifacts
OUTPUT_DIR=/tmp/inference_outputs
REDIS_URL=redis://localhost:6379/0
DEVICE=cuda
```

Get SentinelHub credentials at: https://apps.sentinel-hub.com/dashboard

### 4. Start Redis

```bash
redis-server --daemonize yes
```

### 5. Start Celery worker

```bash
celery -A inference_server.api:celery_app worker --loglevel=info --concurrency=1
```

### 6. Start FastAPI server

```bash
python run_server.py
```

Server runs on `http://localhost:8000`

## API Usage

### Health check

```bash
curl http://localhost:8000/api/health
```

### Fetch imagery and run pipeline

```bash
curl -X POST http://localhost:8000/api/jobs/fetch-and-run \
  -H "Content-Type: application/json" \
  -d '{
    "aoi_bbox":        [68.10, 24.80, 68.45, 25.15],
    "start_date":      "2025-11-01",
    "end_date":        "2025-12-15",
    "region_name":     "Mithi subdistrict",
    "max_cloud_cover": 0.15,
    "resolution_m":    10
  }'
```

**Response**:
```json
{
  "job_id":        "b4a9f2c1",
  "status":        "pending",
  "websocket_url": "/ws/jobs/b4a9f2c1",
  "created_at":    "2026-04-20T14:23:01Z"
}
```

### Upload pre-downloaded GeoTIFF

```bash
curl -X POST http://localhost:8000/api/jobs/upload-and-run \
  -F "file=@/path/to/sentinel.tif" \
  -F "region_name=Tharparkar"
```

### Poll job status

```bash
curl http://localhost:8000/api/jobs/b4a9f2c1
```

**Response**:
```json
{
  "job_id":       "b4a9f2c1",
  "status":       "running",
  "stage":        "segment",
  "progress_pct": 42,
  "message":      "Segmentation: 128/300 batches"
}
```

### Subscribe to WebSocket for real-time updates

```javascript
const ws = new WebSocket("ws://localhost:8000/ws/jobs/b4a9f2c1");
ws.onmessage = (e) => {
  const evt = JSON.parse(e.data);
  console.log(evt.type, evt.payload);
};
```

### Download completed output

```bash
curl http://localhost:8000/api/jobs/b4a9f2c1/download/report_pdf \
  -o Assessment_Report_b4a9f2c1.pdf
```

Available file keys:
- `normalised_tif` — 4-band float32 GeoTIFF
- `seg_mask_tif` — binary segmentation mask
- `roads_raw_shp` — vectorised raw roads
- `roads_classified_shp` — classified roads with confidence
- `roads_classified_csv` — tabular road attributes
- `graph_graphml` — NetworkX graph (GraphML format)
- `graph_geojson` — roads GeoJSON with attributes
- `components_csv` — connected components summary
- `report_pdf` — final PDF report with maps
- `report_zip` — Shapefile + components CSV

## Docker deployment

### Build image

```bash
docker build -t road-assessment-inference:latest .
```

### Run container

```bash
docker run -d \
  --name road-api \
  -p 8000:8000 \
  -e SH_CLIENT_ID=<your-id> \
  -e SH_CLIENT_SECRET=<your-secret> \
  -e DEVICE=cuda \
  --gpus all \
  road-assessment-inference:latest
```

## Configuration

### Pipeline thresholds (from `pipeline_config.pkl`)

Edit `inference_server/pipeline.py` to adjust before training models:

```python
config = {
    "required_bands":              4,
    "normalisation_divisor":       10000.0,
    "nodata_value":                -1.0,
    "cloud_cover_limit":           0.20,
    "target_crs":                  "EPSG:32642",
    
    # Segmentation
    "seg_patch_size":              256,
    "seg_stride":                  128,
    "seg_batch_size":              16,
    "seg_threshold":               0.50,
    
    # Classification
    "clf_patch_size":              64,
    "clf_interval_m":              20,
    "clf_batch_size":              32,
    "clf_min_conf":                0.40,
    
    # Graph
    "node_key_precision":          1,
    "isolated_threshold_nodes":    3,
    "condition_cost": {
        "Good":    1.0,
        "Damaged": 3.5,
        "Unpaved": 2.0,
    }
}
```

## Input/Output Contract

### Input

- **AOI bbox**: `[min_lon, min_lat, max_lon, max_lat]` in WGS84
- **Date range**: ISO date strings `"YYYY-MM-DD"`
- **Optional**: cloud cover threshold (0.0–1.0, default 0.20)
- **Optional**: resolution in meters (default 10)

### Output files

| File | Format | Description |
|------|--------|-------------|
| `normalised.tif` | GeoTIFF float32 | 4-band (B02, B03, B04, B08) normalised 0–1 |
| `seg_mask.tif` | GeoTIFF uint8 | Binary road pixels (0/1) |
| `roads_classified.shp` | Shapefile | LineStrings with condition/confidence |
| `report_data.csv` | CSV | Tabular segment attributes |
| `road_graph.graphml` | GraphML | NetworkX graph topology |
| `connected_components.csv` | CSV | Per-component statistics |
| `Assessment_Report_{id}.pdf` | PDF | 4 maps + summary statistics |
| `report_vector_{id}.zip` | ZIP | Shapefiles + components CSV |

## Pipeline stages

Each stage emits real-time progress via WebSocket:

```
fetch      → 0–100%    (SentinelHub download)
preprocess → 10–100%   (validate, reproject, normalise)
segment    → 0–100%    (U-Net sliding window)
classify   → 0–100%    (EfficientNet patch averaging)
graph      → 0–100%    (NetworkX topology + centrality)
report     → 0–100%    (PDF + map generation)
```

## Error handling

Common error codes returned in `job_failed` event:

| Error | Cause | Recoverable |
|-------|-------|------------|
| `CLOUD_COVER_TOO_HIGH` | >20% cloud in scene | No — try different date |
| `NO_ROADS_DETECTED` | U-Net found no roads | No — check imagery |
| `INSUFFICIENT_BANDS` | Upload has <4 bands | No — provide 4-band GeoTIFF |
| `IMAGE_TOO_SMALL` | <256×256 pixels | No — expand AOI |
| `SEGMENTATION_OOM` | GPU out of memory | Yes — reduce patch size |
| `INTERNAL_ERROR` | Unexpected exception | Yes — retry |

## Performance

Typical run on a 1024×1024 pixel image (RTX A100):

| Stage | Time |
|-------|------|
| Preprocess | 30 sec |
| Segmentation | 2–3 min |
| Classification | 3–4 min |
| Graph analysis | 1 min |
| Report generation | 2 min |
| **Total** | **8–11 min** |

Memory usage: ~6 GB GPU (models + batch processing)

## References

- [Sentinelhub-py documentation](https://sentinelhub-py.readthedocs.io/)
- [U-Net architecture](https://arxiv.org/abs/1505.04597)
- [EfficientNet-B0](https://arxiv.org/abs/1905.11946)
- [NetworkX](https://networkx.org/)

## License

This project is part of an IBA SMCS capstone on road quality assessment in rural Sindh, Pakistan.

## Team

- Ghulam Murtaza Tunio (27150)
- Hammadullah Muazam (27033)
- Isht Dev (27164)

**Supervisor**: Ms. Tasbiha Fatima  
**Co-supervisor**: Mr. Abdul Wahab
