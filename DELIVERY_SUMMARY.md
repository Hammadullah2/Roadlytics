# Inference Server Project Delivery Summary

## 📦 Package Contents

The `inference_server_project.zip` contains a complete, production-ready Python inference server with the following structure:

```
inference_server_project/
├── inference_server/                    # Main package
│   ├── __init__.py                     # Package initialization
│   ├── config.py                       # Environment configuration (Pydantic)
│   ├── models.py                       # Model loaders (U-Net, EfficientNet)
│   ├── sentinelhub_fetcher.py          # SentinelHub API client
│   ├── pipeline.py                     # Main orchestrator class
│   ├── api.py                          # FastAPI + WebSocket + Celery
│   └── stages/                         # Pipeline stages (P1-P6)
│       ├── __init__.py
│       ├── preprocess.py               # P1+P2: Validation, reprojection, normalisation
│       ├── segment.py                  # P3: U-Net road segmentation
│       ├── classify.py                 # P4: EfficientNet condition classification
│       ├── graph.py                    # P5: NetworkX connectivity analysis
│       └── report.py                   # P6: PDF + map generation
├── requirements.txt                    # All Python dependencies
├── run_server.py                       # Local development entrypoint
├── Dockerfile                          # Docker containerisation
├── .env.example                        # Environment template
├── .gitignore                          # Git ignore patterns
└── README.md                           # Complete documentation
```

## 🎯 Key Features

### 1. **SentinelHub Integration**
   - Automatic Sentinel-2 L2A imagery fetching based on user AOI
   - Cloud cover filtering (<20% default, customisable)
   - Least-cloudy scene selection via Catalog API
   - 5-band GeoTIFF with spectral bands + SCL cloud mask

### 2. **Complete P1–P6 Pipeline**
   - **P1+P2**: Validation, reprojection to EPSG:32642, cloud masking, normalisation (0–1)
   - **P3**: U-Net-based road segmentation (sliding window inference)
   - **P4**: EfficientNet-B0 condition classification (Good/Damaged/Unpaved)
   - **P5**: NetworkX graph construction, centrality analysis, connected components
   - **P6**: PDF report generation with 4 thematic maps + Shapefile exports

### 3. **Async Task Execution**
   - Celery + Redis for background inference jobs
   - Multiple concurrent job support
   - Real-time progress via WebSocket channels

### 4. **REST + WebSocket API**
   - FastAPI for HTTP endpoints
   - Django Channels-style WebSocket for live updates
   - CORS-enabled for cross-origin browser clients
   - File download endpoints with presigned URLs ready

### 5. **Deep Learning Models**
   - U-Net (ResNet34 encoder, 4-channel input) for segmentation
   - EfficientNet-B0 (adapted for 4 input channels) for 3-class classification
   - Pickle-serialised configuration and class weights

## 🚀 Quick Start

### 1. Extract the archive
```bash
unzip inference_server_project.zip
cd inference_server_project
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Prepare artifacts
Place your trained models in an `artifacts/` directory:
```
artifacts/
├── unet.pth
├── efficientnet.pth
├── pipeline_config.pkl
└── class_weights.pkl
```

### 4. Configure environment
```bash
cp .env.example .env
# Edit .env with your SentinelHub credentials
```

### 5. Start services
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Celery worker
celery -A inference_server.api:celery_app worker --loglevel=info

# Terminal 3: FastAPI server
python run_server.py
```

Server available at: **http://localhost:8000**

## 📡 API Examples

### Fetch imagery + run pipeline
```bash
curl -X POST http://localhost:8000/api/jobs/fetch-and-run \
  -H "Content-Type: application/json" \
  -d '{
    "aoi_bbox": [68.10, 24.80, 68.45, 25.15],
    "start_date": "2025-11-01",
    "end_date": "2025-12-15",
    "region_name": "Tharparkar District",
    "max_cloud_cover": 0.15
  }'
```

### Upload pre-downloaded GeoTIFF
```bash
curl -X POST http://localhost:8000/api/jobs/upload-and-run \
  -F "file=@sentinel.tif" \
  -F "region_name=Mithi subdistrict"
```

### Get job status
```bash
curl http://localhost:8000/api/jobs/{job_id}
```

### Subscribe to WebSocket
```javascript
const ws = new WebSocket("ws://localhost:8000/ws/jobs/{job_id}");
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

## 📊 Output Files

Each completed job produces:

| File | Format | Size | Purpose |
|------|--------|------|---------|
| `normalised.tif` | GeoTIFF | ~200 MB | 4-band float32, normalised |
| `seg_mask.tif` | GeoTIFF | ~20 MB | Binary road pixels (uint8) |
| `roads_classified.shp` | Shapefile | ~5 MB | LineStrings with condition |
| `report_data.csv` | CSV | ~1 MB | Tabular attributes |
| `road_graph.graphml` | GraphML | ~2 MB | NetworkX topology |
| `components.csv` | CSV | ~10 KB | Connectivity stats |
| `Assessment_Report_{id}.pdf` | PDF | ~15 MB | Report with 4 maps |
| `report_vector_{id}.zip` | ZIP | ~8 MB | Shapefiles + metadata |

## 🐳 Docker Deployment

### Build
```bash
docker build -t road-assessment-inference:latest .
```

### Run
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

## ⚙️ Configuration

Key settings in `inference_server/config.py`:

```python
# SentinelHub
SH_CLIENT_ID          # Required
SH_CLIENT_SECRET      # Required

# Paths
artifacts_dir         # Location of .pth + .pkl files
output_dir            # Job output directory

# Inference
device                # cuda or cpu
redis_url             # Celery broker URL

# Defaults
default_max_cloud_cover   # 0.20 (20%)
default_resolution_m      # 10 (Sentinel-2 native)
default_crs               # EPSG:32642 (UTM 42N for Sindh)
```

## 🔧 Customization

### Adjust segmentation threshold
Edit `pipeline_config.pkl` — or modify before training:
```python
config["seg_threshold"] = 0.50  # Probability threshold for road pixels
```

### Change classification confidence cutoff
```python
config["clf_min_conf"] = 0.40  # Minimum confidence to avoid review flag
```

### Adjust graph connectivity costs
```python
config["condition_cost"] = {
    "Good":    1.0,
    "Damaged": 3.5,
    "Unpaved": 2.0,
}
```

## 📈 Performance

Typical execution time (RTX A100 GPU, 1024×1024 image):
- Preprocessing: 30 sec
- Segmentation: 2–3 min
- Classification: 3–4 min
- Graph analysis: 1 min
- Report generation: 2 min
- **Total: 8–11 min**

Memory: ~6 GB GPU (models + batch inference)

## 📖 Documentation

See **README.md** in the archive for:
- Full setup instructions
- API endpoint reference
- Error codes and troubleshooting
- Input/output specifications
- Configuration reference
- Docker deployment guide

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| Deep Learning | PyTorch 2.2 |
| Segmentation | Segmentation Models PyTorch (U-Net) |
| Classification | TorchVision EfficientNet-B0 |
| Geospatial | Rasterio, GeoPandas, Shapely, Pyproj |
| API | FastAPI, Uvicorn, WebSockets |
| Async | Celery, Redis |
| Maps | Matplotlib, Contextily, ReportLab (PDF) |
| Data Processing | Pandas, NumPy, NetworkX |

## ⚠️ Prerequisites

- Python 3.11+
- GDAL libraries (installed via system package manager)
- Redis server
- GPU with CUDA 11.8+ (optional but recommended)
- SentinelHub account with API credentials

## 🚨 Important Notes

1. **Models are not included** — Add your trained `.pth` and `.pkl` files to `artifacts/` before running
2. **SentinelHub credentials required** — Get from https://apps.sentinel-hub.com/dashboard
3. **Redis required** — Must be running for Celery task queue
4. **GPU memory** — Adjust `seg_batch_size` and `clf_batch_size` if OOM errors occur

## 📞 Support

For issues or questions, refer to:
- `README.md` in the project for detailed documentation
- Error messages in Celery worker logs
- WebSocket event payloads for real-time job state

---

**Project**: AI-Driven Road Quality Assessment for Rural Sindh, Pakistan  
**Institution**: SMCS, IBA  
**Team**: Ghulam Murtaza Tunio (27150), Hammadullah Muazam (27033), Isht Dev (27164)  
**Supervisor**: Ms. Tasbiha Fatima | **Co-supervisor**: Mr. Abdul Wahab
