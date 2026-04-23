# Road Quality Assessment — ML Pipeline Reference

> Complete technical reference for the AI-driven road quality assessment pipeline using Sentinel-2 imagery over rural Sindh.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Stage 1 — Data Acquisition](#2-stage-1--data-acquisition)
3. [Stage 2 — QGIS Preprocessing](#3-stage-2--qgis-preprocessing)
4. [Stage 3 — U-Net Road Segmentation](#4-stage-3--u-net-road-segmentation)
5. [Stage 4 — EfficientNet Condition Classification](#5-stage-4--efficientnet-condition-classification)
6. [Stage 5 — Graph Connectivity Analysis](#6-stage-5--graph-connectivity-analysis)
7. [Stage 6 — Report Generation](#7-stage-6--report-generation)
8. [Artifact Files for Inference](#8-artifact-files-for-inference)
9. [Automated Python Scripts (No QGIS)](#9-automated-python-scripts-no-qgis)
10. [Application I/O Specification](#10-application-io-specification)
11. [End-to-End SentinelHub Inference Server](#11-end-to-end-sentinelhub-inference-server)
12. [Stage-by-Stage Data Flow Summary](#12-stage-by-stage-data-flow-summary)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT BROWSER                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  React / Vue Web Dashboard                                           │   │
│  │  Dashboard │ Map Analysis │ Processing Jobs │ Reports                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└────────────────┬─────────────────────────────────┬──────────────────────────┘
                 │ HTTP/REST                        │ WebSocket
                 ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DJANGO / FASTAPI SERVER                              │
│         Views / Endpoints  │  Channels Layer  │  Celery Producer            │
└───────┬────────────────────────────┬────────────────────────┬───────────────┘
        │                            │                        │
        ▼                            ▼                        ▼
┌───────────────┐           ┌────────────────┐      ┌──────────────────┐
│  PostgreSQL   │           │     Redis      │      │   Celery Worker   │
│  + PostGIS    │           │  (broker +     │      │   Inference Pool  │
└───────────────┘           │  pub/sub)      │      │  U-Net            │
                            └────────────────┘      │  EfficientNet     │
                                                    │  NetworkX         │
                                                    │  Report gen       │
                                                    └─────────┬─────────┘
                                                              ▼
                                                    ┌──────────────────┐
                                                    │ Object Storage   │
                                                    │ (S3 / Supabase)  │
                                                    └──────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript | UI for all screens |
| Maps | Leaflet + leaflet-geotiff | Interactive map, GeoTIFF overlay, GeoJSON rendering |
| State | Redux Toolkit + RTK Query | API caching, WebSocket state sync |
| Backend | Django / FastAPI | REST API, authentication |
| Real-time | Django Channels / WebSocket | Live job updates |
| Queue | Celery + Redis | Async inference task execution |
| Database | PostgreSQL + PostGIS | Users, projects, jobs, spatial data |
| Storage | S3 / Supabase Storage | Uploaded GeoTIFFs, generated artefacts |
| Inference | PyTorch + InferencePipeline | Segmentation, classification, graph analysis |

---

## 2. Stage 1 — Data Acquisition

### Source
- **Platform:** Copernicus Data Space Ecosystem (`browser.dataspace.copernicus.eu`)
- **Product:** Sentinel-2 Level-2A (L2A) — atmospherically corrected Surface Reflectance
- **Cloud cover filter:** < 20% (NFR-16)
- **Season:** November–February (dry season, lowest cloud cover in Sindh)

### AOI for Sindh
```
min_lon=68.1, min_lat=24.8, max_lon=70.5, max_lat=26.3
```

### Sentinel-2 `.SAFE` Folder Structure
```
S2B_MSIL2A_20241215T055149_N0511_R077_T42RUN_20241215T082034.SAFE/
  GRANULE/
    L2A_T42RUN_A040123_20241215T055149/
      IMG_DATA/
        R10m/
          T42RUN_20241215T055149_B02_10m.jp2   ← Blue
          T42RUN_20241215T055149_B03_10m.jp2   ← Green
          T42RUN_20241215T055149_B04_10m.jp2   ← Red
          T42RUN_20241215T055149_B08_10m.jp2   ← NIR
        R20m/
          T42RUN_20241215T055149_SCL_20m.jp2   ← Scene Classification Layer
```

### Tile Codes for Sindh
- `T42RUN` = UTM Zone 42N — covers western Sindh (west of ~66°E)
- `T43RQN` = UTM Zone 43N — covers Tharparkar, Mirpurkhas (eastern Sindh)
- If AOI straddles two tiles, mosaic via QGIS Build Virtual Raster (`.vrt`)

### Band Reference

| Band | Wavelength | Resolution | Role |
|---|---|---|---|
| B02 | Blue | 10m | Channel 0 — spectral input |
| B03 | Green | 10m | Channel 1 — spectral input |
| B04 | Red | 10m | Channel 2 — spectral input |
| B08 | NIR | 10m | Channel 3 — key for bare soil / road discrimination |
| SCL | Classification | 20m | Cloud masking only |

### SCL Values

| Value | Meaning | Mask? |
|---|---|---|
| 0 | No data | Yes |
| 1 | Saturated / defective | Yes |
| 3 | Cloud shadows | Yes |
| 8 | Cloud medium probability | Yes |
| 9 | Cloud high probability | Yes |
| 10 | Thin cirrus | Yes |
| 4 | Vegetation | No |
| 5 | Bare soil | No |
| 6 | Water | Optional |

---

## 3. Stage 2 — QGIS Preprocessing

### Step 2a — Band Stacking

**Tool:** Raster → Miscellaneous → Merge

- Input: B02, B03, B04, B08 `.jp2` files in that order
- Enable: "Place each input file into a separate band"
- Output data type: Float32

**Output:** `sindh_raw_stack.tif`
- Format: GeoTIFF, 4 bands, float32
- Pixel values: 0–10,000 (raw DN)
- Resolution: 10m × 10m
- CRS: EPSG:32642 or EPSG:32643

### Step 2b — AOI Clipping

**Tool:** Raster → Extraction → Clip Raster by Mask Layer

- Reproject AOI polygon to match stack CRS first
- Nodata value: -9999

**Output:** `sindh_clipped_stack.tif`

### Step 2c — Cloud Masking

**Tool:** Raster Calculator

Expression:
```
("SCL_band@1" = 8) OR ("SCL_band@1" = 9) OR
("SCL_band@1" = 3) OR ("SCL_band@1" = 10) OR
("SCL_band@1" = 0) OR ("SCL_band@1" = 1)
```

**Output:** `cloud_mask_20m.tif` — uint8, 1=masked, 0=valid

### Step 2d — Resample Cloud Mask to 10m

**Tool:** Raster → Projections → Warp (Reproject)

- Resampling method: **Nearest Neighbour** (categorical data — no interpolation)
- Output resolution: 10m × 10m

**Output:** `cloud_mask_10m.tif`

### Step 2e — Normalisation

Divide all pixel values by 10,000 to bring range to [0.0, 1.0].  
Best done in Python to protect nodata values:

```python
valid = data != nodata
data[valid] = data[valid] / 10000.0
data[~valid] = -1.0
```

**Output:** `sindh_normalised_stack.tif`
- Format: GeoTIFF, 4 bands, float32
- Values: 0.0–~0.65 for valid pixels, -1.0 for nodata
- Resolution: 10m × 10m, CRS: EPSG:32642

### Step 2f — Road Centreline Preparation

**Sources:**
1. OSM via QuickOSM plugin (`Key: highway`, `Value: track,path,unclassified,...`)
2. Manual digitisation in QGIS (false-colour composite: NIR=Red, Red=Green, Green=Blue)

**Condition labelling criteria (TRL ReCAP):**
- `Good` — smooth, uniform texture, consistent width, clear edges
- `Damaged` — variable width, broken edges, visible erosion patches
- `Unpaved` — bare earth/gravel surface, lighter colour, wheel tracks

**Output:** `road_centrelines.shp`
- Geometry: LineString
- CRS: EPSG:32642
- Fields: `road_id` (int), `road_type` (str), `condition` (str), `surface` (str), `length_m` (float), `notes` (str)

### Step 2g — Rasterise Centrelines

**Tool:** Raster → Conversion → Rasterize (Vector to Raster)
- Burn value: 1, background: 0, resolution: 10m
- Extent: calculated from `sindh_normalised_stack.tif`

**Dilation (Python):**
```python
from scipy.ndimage import binary_dilation
dilated = binary_dilation(mask, iterations=1).astype(np.uint8)
# iterations=1 → 3px wide = 30m (typical rural road width)
```

**Output:** `road_mask.tif`
- Format: GeoTIFF, uint8, 1 band
- Values: 0 = background, 1 = road
- Must have identical geotransform and CRS as `sindh_normalised_stack.tif`

### Verification Checklist
```python
import rasterio
with rasterio.open("sindh_normalised_stack.tif") as s, \
     rasterio.open("road_mask.tif") as m:
    assert s.transform == m.transform, "Geotransforms do not match"
    assert s.crs        == m.crs,       "CRS does not match"
    assert s.shape      == m.shape,     "Dimensions do not match"
```

---

## 4. Stage 3 — U-Net Road Segmentation

### Environment Setup
```bash
pip install torch torchvision segmentation-models-pytorch
pip install rasterio numpy albumentations scikit-learn matplotlib tensorboard tqdm
```

### Dataset Preparation

**Patch extraction settings:**
- Patch size: 256×256 (covers 2.56 km × 2.56 km at 10m)
- Stride: 128 (50% overlap — ensures road segments appear fully in at least one patch)
- Min road pixels: 50 (discard near-empty patches)
- Discard patches with >20% nodata

**Input per patch:** `(4, 256, 256)` float32, 0–1  
**Label per patch:** `(1, 256, 256)` float32, values 0 or 1

**Train/val/test split:** 70/15/15 by geographic row (not random) to prevent spatial leakage.

### Augmentations

| Transform | Parameter | Applies to |
|---|---|---|
| HorizontalFlip | p=0.5 | Image + Mask |
| VerticalFlip | p=0.5 | Image + Mask |
| RandomRotate90 | p=0.5 | Image + Mask |
| ShiftScaleRotate | scale±10%, rotate±15°, p=0.4 | Image + Mask |
| RandomBrightnessContrast | ±15%, p=0.4 | Image only |
| GaussNoise | var 0.001–0.005, p=0.3 | Image only |
| GaussianBlur | 3–5px, p=0.2 | Image only |

> **Do not** apply colour jitter independently per channel — corrupts multi-spectral relationships.

### Model Architecture

```python
import segmentation_models_pytorch as smp

model = smp.Unet(
    encoder_name    = "resnet34",
    encoder_weights = "imagenet",
    in_channels     = 4,    # B02, B03, B04, B08
    classes         = 1,    # binary: road vs background
    activation      = None, # sigmoid applied manually
)
# ~24.4M parameters
```

**4th channel (NIR) initialisation:** SMP averages pretrained 3-channel weights automatically with `in_channels=4`.

**Encoder spatial reduction:** (4,256,256) → (64,128,128) → (64,64,64) → (128,32,32) → (256,16,16) → (512,8,8)  
Skip connections restore spatial detail at each decoder step.

### Loss Function

```python
def combined_loss(pred, target, alpha=0.5, beta=0.5, smooth=1e-6):
    bce = F.binary_cross_entropy(pred, target)
    intersection = (pred * target).sum()
    dice = 1 - (2 * intersection + smooth) / (pred.sum() + target.sum() + smooth)
    return alpha * bce + beta * dice
```

Dice loss corrects for class imbalance (roads = 5–15% of pixels).

### Training Hyperparameters

| Parameter | Value |
|---|---|
| Batch size | 8 |
| Epochs | 60 |
| Learning rate | 3e-4 |
| Weight decay | 1e-4 |
| Patience (early stop) | 10 |
| Threshold | 0.5 |
| Optimiser | AdamW |
| Scheduler | CosineAnnealingLR |

### Two-Phase Training Strategy

```python
# Phase 1 (epochs 1–10): freeze encoder, train decoder only
for param in model.encoder.parameters():
    param.requires_grad = False
optimizer = AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=1e-3)

# Phase 2: unfreeze all
for param in model.encoder.parameters():
    param.requires_grad = True
optimizer = AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
```

### Evaluation Metrics

- **Primary:** IoU (target 65–75% — NFR-11)
- Also track: Precision, Recall, F1
- If recall low → lower threshold to 0.35–0.4 (tuned on val set only)
- If precision low → raise threshold slightly

### Full-Scene Inference

- Sliding window with same stride as training
- Overlapping regions: **average probability predictions** (eliminates checkerboard artifacts)
- Replace nodata pixels with 0.0 before inference

**Output:** `segmentation_mask_predicted.tif`
- Format: GeoTIFF with LZW compression
- uint8, 1 band, 0=background, 1=road
- Same CRS and geotransform as input

### Vectorisation (QGIS)

1. Raster → Conversion → Polygonize
2. Filter `value=1` polygons
3. Polygons to Lines
4. Simplify (tolerance 5–10m)

**Output:** `predicted_roads.shp`
- Geometry: LineString
- Fields: `road_id` (int), `length_m` (float)

---

## 5. Stage 4 — EfficientNet Condition Classification

### Conceptual Difference from U-Net

U-Net is pixel-level (every pixel gets road/background). EfficientNet is patch-level — one 64×64 patch per road sample gets a single condition label: Good, Damaged, or Unpaved.

### Patch Sampling

- Sample points every **20m** along each road centreline
- Extract **64×64 pixel** patch centred on each point from the 4-band stack
- 64px × 10m = covers 640m × 640m around the sample point

**Input per patch:** `(4, 64, 64)` float32, 0–1  
**Label per patch:** `0=Good, 1=Damaged, 2=Unpaved`

### Class Imbalance Handling

Expected distribution for rural Sindh:
```
Unpaved    ~60%
Damaged    ~25%
Good       ~15%
```

**Fix 1 — WeightedRandomSampler:**
```python
class_weights = 1.0 / class_counts
sampler = WeightedRandomSampler(weights=sample_weights, num_samples=len(sample_weights), replacement=True)
```

**Fix 2 — Loss weighting:**
```python
# Example: tensor([2.73, 1.31, 0.55]) for [Good, Damaged, Unpaved]
criterion = nn.CrossEntropyLoss(weight=loss_weights, label_smoothing=0.1)
```

Label smoothing of 0.1 prevents overconfidence on ambiguous patches.

### Model Architecture

```python
from torchvision.models import efficientnet_b0

model = efficientnet_b0(weights=None)

# Modify stem conv for 4 channels
new_conv = nn.Conv2d(4, old_conv.out_channels, ...)
# NIR channel init: average of pretrained R/G/B weights
new_conv.weight[:, 3:4, :, :] = old_conv.weight.mean(dim=1, keepdim=True)
model.features[0][0] = new_conv

# Replace classifier head
model.classifier[1] = nn.Linear(1280, 3)
# ~4.0M parameters
```

**Why B0?** ~4M parameters — fits the small Sindh dataset without overfitting. B3/B5 (10–30M params) would overfit badly.

### Augmentations

Same as U-Net augmentations plus:
- `CoarseDropout(max_holes=4, max_height=12, max_width=12, p=0.3)` — forces spatial invariance, simulates partial occlusion

### Mixup Augmentation

```python
lam = np.random.beta(alpha, alpha)   # alpha=0.3
mixed_x = lam * images + (1-lam) * images[shuffled_idx]
mixed_y = lam * one_hot_y + (1-lam) * one_hot_y[shuffled_idx]
# Use KLDivLoss for soft label targets
```

### Training Hyperparameters

| Parameter | Value |
|---|---|
| Batch size | 32 |
| Epochs | 50 |
| Learning rate | 1e-3 |
| Patience (early stop) | 12 |
| Mixup alpha | 0.3 |
| Optimiser | AdamW |
| Scheduler | OneCycleLR (30% warmup) |

### Evaluation

- **Primary:** Accuracy (target 70–80% — NFR-12)
- Track per-class F1: Good, Damaged, Unpaved
- **Critical error:** `cm[1,0]` (Damaged predicted as Good) — worst stakeholder impact
- Acceptable error: Good ↔ Unpaved confusion

### Segment-Level Aggregation

```python
# Average softmax probability vectors across all patches for a segment
avg_probs  = np.concatenate(all_probs).mean(axis=0)  # shape: (3,)
pred_class = int(avg_probs.argmax())
confidence = float(avg_probs.max())
```

Benefits: robust to single noisy patches, provides stable segment-level confidence score.

### Output: `predicted_roads_classified.shp`

| Field | Type | Description |
|---|---|---|
| condition | str | Good / Damaged / Unpaved |
| confidence | float | Max averaged softmax probability 0–1 |
| prob_good | float | Averaged probability for Good |
| prob_dam | float | Averaged probability for Damaged |
| prob_unp | float | Averaged probability for Unpaved |
| length_m | float | Segment length in metres |
| review_flag | bool | True if confidence < 0.40 |

---

## 6. Stage 5 — Graph Connectivity Analysis

### Conceptual Model

Graph G = (V, E) where:
- **V** = road junctions and endpoints (geographic coordinates)
- **E** = road segments connecting two vertices
- **Edge weight** = `length_m × condition_cost`

```
condition_cost = { "Good": 1.0, "Damaged": 3.5, "Unpaved": 2.0 }
```

### Topology Cleaning (Before Graph Construction)

Three error classes from segmentation vectorisation:

1. **Dangling endpoints** — near-coincident endpoints not touching (snap with 15m tolerance)
2. **Missing intersection nodes** — crossing segments without shared node (split at intersections)
3. **Duplicate/fragmented segments** — merge via `linemerge()`, remove slivers < 2m

**Python cleanup:**
```python
from shapely.ops import unary_union, linemerge, split
all_lines = unary_union(roads.geometry)
merged    = linemerge(all_lines)
# Then split at intersection points (coordinates appearing in ≥2 lines)
```

### Node Key Deduplication

```python
def node_key(coord, precision=1):
    return f"{round(coord[0], precision)}_{round(coord[1], precision)}"
# 1m precision absorbs sub-metre floating point mismatches
```

### Graph Construction

```python
G = nx.Graph()
for _, row in roads.iterrows():
    u, v   = node_key(coords[0]), node_key(coords[-1])
    weight = row["length_m"] * CONDITION_COST[row["condition"]]
    G.add_edge(u, v, weight=weight, length_m=..., condition=..., segment_id=...)
```

Self-loops (u == v after rounding) are skipped. Parallel edges: keep the lower-weight one.

### Connected Components Analysis (BFS)

```python
components = sorted(nx.connected_components(G), key=len, reverse=True)
# component_id=0 = largest (main) network
is_isolated = len(comp_nodes) <= 3
```

**Output:** `connected_components.csv`

| Column | Type | Description |
|---|---|---|
| component_id | int | 0 = largest (main) network |
| n_nodes | int | Number of junctions |
| n_edges | int | Number of road segments |
| total_length_km | float | Total road length |
| pct_good / pct_damaged / pct_unpaved | float | Condition breakdown |
| centroid_x_utm / centroid_y_utm | float | Geographic centre |
| is_isolated | bool | True if ≤ 3 nodes |

### Dijkstra Shortest Path

```python
distances, paths = nx.single_source_dijkstra(G, source_node, weight="weight")
```

**`worst_condition` along path** is critical for emergency planners — a single Damaged segment can make a route impassable regardless of total distance.

**Output:** `shortest_paths.csv`

| Column | Description |
|---|---|
| target_node | Destination node key |
| cost_weighted | Dijkstra cost (length × condition factor) |
| distance_m | True physical distance |
| n_hops | Road segments traversed |
| worst_condition | Bottleneck condition on route |
| reachable | False if node is in isolated component |

### Centrality Analysis

```python
# Betweenness — identifies critical junctions (k=min(500, n_nodes) sampling)
betweenness = nx.betweenness_centrality(G, k=k_sample, weight="weight")

# Degree — number of connecting segments
degree_cent = nx.degree_centrality(G)

# Closeness — computed on largest component only
closeness = nx.closeness_centrality(largest_comp, distance="weight")
```

**Output:** `road_junctions.shp` — Point Shapefile with `betweenness`, `degree`, `closeness`, `component_id`

### Export Formats

| File | Format | Consumer |
|---|---|---|
| `roads_clean.shp` | ESRI Shapefile | Stage 6, QGIS |
| `connected_components.csv` | CSV | Stage 6 stats |
| `shortest_paths.csv` | CSV | Dashboard route queries |
| `road_junctions.shp` | ESRI Shapefile | QGIS centrality heatmap |
| `road_graph.graphml` | GraphML XML | Gephi, QGIS network plugin |
| `road_graph.geojson` | GeoJSON | Web dashboard Connectivity layer |
| `road_graph.json` | JSON | API endpoint for frontend |

---

## 7. Stage 6 — Report Generation

### Three Output Artefacts

1. **PDF** — human-readable assessment report
2. **CSV** — machine-readable segment data with WKT geometry
3. **Shapefile ZIP** — GIS-ready vector package

### Four Map Images

| Map | Content | Source |
|---|---|---|
| Figure 1 — Satellite | Esri WorldImagery basemap + AOI outline | contextily |
| Figure 2 — Segmentation | Red semi-transparent U-Net mask overlay | rasterio |
| Figure 3 — Condition | Green/Red/Grey road lines by condition | GeoDataFrame |
| Figure 4 — Connectivity | Random colour per component (isolated = isolated islands) | GeoDataFrame |

### Summary Statistics

```python
total_km      = roads["length_m"].sum() / 1000
good_pct      = (roads["condition"] == "Good").sum() / len(roads) * 100
damaged_pct   = (roads["condition"] == "Damaged").sum() / len(roads) * 100
unpaved_pct   = (roads["condition"] == "Unpaved").sum() / len(roads) * 100
n_isolated    = (components["component_size_km"] < 1.0).sum()
```

### PDF Structure (ReportLab)

1. Title + Report ID
2. Metadata table (region, coordinates, scene date, cloud cover)
3. Summary statistics table (dark header, alternating rows)
4. Page break
5. 4 map images with captions

### CSV Export Columns

```
segment_id, road_label, confidence_score, length_meters, geom_as_wkt, connected_component_id
```

### Shapefile Column Name Limit

dBASE `.dbf` field names are limited to **10 characters** — rename before export:

```python
export_gdf = export_gdf.rename(columns={
    "road_id":      "seg_id",
    "condition":    "condition",
    "confidence":   "conf_score",
    "length_m":     "len_m",
    "component_id": "comp_id",
})
```

Always distribute `.shp`, `.shx`, `.dbf`, `.prj` together as a ZIP.

---

## 8. Artifact Files for Inference

### The Four Files

```
artifacts/
  unet.pth              ~90 MB   PyTorch state dict
  efficientnet.pth      ~16 MB   PyTorch state dict
  pipeline_config.pkl   ~2 KB    Python dict
  class_weights.pkl     ~1 KB    Python dict
```

### `pipeline_config.pkl` Contents

```python
pipeline_config = {
    # Preprocessing
    "target_crs":               "EPSG:32642",
    "normalisation_divisor":    10000.0,
    "nodata_value":             -1.0,
    "cloud_scl_values":         [3, 8, 9, 10],
    "cloud_cover_limit":        0.20,
    "required_bands":           4,

    # Segmentation
    "seg_patch_size":           256,
    "seg_stride":               128,
    "seg_threshold":            0.50,
    "seg_batch_size":           16,

    # Classification
    "clf_patch_size":           64,
    "clf_interval_m":           20,
    "clf_batch_size":           32,
    "clf_min_conf":             0.40,

    # Topology
    "snap_tolerance_m":         15.0,
    "min_segment_len_m":        2.0,

    # Graph
    "node_key_precision":       1,
    "condition_cost": {
        "Good":    1.0,
        "Damaged": 3.5,
        "Unpaved": 2.0,
    },
    "isolated_threshold_nodes": 3,

    # Report
    "report_map_dpi":           150,
    "report_map_zoom":          13,
}
```

### Saving Artifacts After Training

```python
# Save U-Net
torch.save(model.state_dict(), "artifacts/unet.pth")

# Save EfficientNet
torch.save(model.state_dict(), "artifacts/efficientnet.pth")

# Save config
import pickle
with open("artifacts/pipeline_config.pkl", "wb") as f:
    pickle.dump(pipeline_config, f)

with open("artifacts/class_weights.pkl", "wb") as f:
    pickle.dump({"loss_weights": ..., "class_counts": ...}, f)
```

### `InferencePipeline` Class Interface

```python
pipeline = InferencePipeline("artifacts/")
result   = pipeline.run(tif_path, output_dir, region_name)

# result keys:
# "status", "seg_mask_tif", "roads_shp", "roads_csv",
# "graph_graphml", "graph_geojson", "components_csv",
# "report_pdf", "report_zip", "stats"
```

---

## 9. Automated Python Scripts (No QGIS)

### Script 1 — `normalize_tif.py`

Replaces all of Stage 2 (Steps 2a–2e).

**Usage:**
```bash
python normalize_tif.py \
    --safe_dir /data/S2B_MSIL2A_20241215.SAFE \
    --aoi      24.8,68.1,26.3,70.5 \
    --out      outputs/sindh_normalised_stack.tif
```

**Process:**
1. Locate B02/B03/B04/B08 `.jp2` files via glob in `.SAFE` structure
2. Reproject all 4 bands to `TARGET_CRS` at 10m (bilinear interpolation)
3. Reproject SCL to 10m (**nearest-neighbour** — categorical)
4. Compute cloud cover fraction from SCL; reject if > 20%
5. Stack bands, clip to AOI via `rasterio.mask`
6. Normalise: divide by 10,000, set nodata = -1.0

**Output:** `sindh_normalised_stack.tif` — float32, 4 bands, 0–1, EPSG:32642, nodata=-1.0

### Script 2 — `build_road_mask.py`

Replaces Steps 2f and 2g.

**Usage:**
```bash
python build_road_mask.py \
    --tif  outputs/sindh_normalised_stack.tif \
    --aoi  24.8,68.1,26.3,70.5 \
    --out  outputs/road_mask.tif \
    --shp  outputs/road_centrelines.shp
```

**OSM tags downloaded:**
```python
ROAD_TAGS = {
    "highway": [
        "motorway", "trunk", "primary", "secondary", "tertiary",
        "unclassified", "residential", "service",
        "track",   # most important for rural Sindh
        "path",
        "road",
    ]
}
```

**Key setting:** `all_touched=True` in `rasterize()` — burns any pixel the line touches, not just centres.

**Outputs:**
- `road_mask.tif` — uint8, 1-band, 0/1, pixel-aligned to normalised stack
- `road_centrelines.shp` — LineString with all OSM attributes

### Script 3 — `label_conditions.py`

Automatically assigns condition labels using a 4-level priority hierarchy.

**Usage:**
```bash
python label_conditions.py \
    --shp  outputs/road_centrelines.shp \
    --tif  outputs/sindh_normalised_stack.tif \
    --out  outputs/road_centrelines_labelled.shp
```

**Priority hierarchy:**

| Priority | Source | Confidence |
|---|---|---|
| 1 | OSM `surface` tag | 0.55–0.95 |
| 2 | OSM `tracktype` tag (grade1–grade5) | 0.55–0.75 |
| 3 | `highway` type heuristic | 0.40–0.80 |
| 4 | NIR pixel intensity std_dev | 0.30–0.55 |

**OSM surface → condition mapping (selected):**
- `asphalt`, `concrete`, `paved` → Good (0.85–0.90)
- `unpaved`, `dirt`, `earth`, `sand` → Unpaved (0.90–0.95)
- `paving_stones`, `cobblestone` → Damaged (0.65)
- `track` (highway) → Unpaved (0.60)

**Pixel intensity thresholds (NIR B08 normalised):**
- std_dev < 0.035 → Good (uniform surface)
- std_dev > 0.060 → Damaged (high variation)
- between → Unpaved

**Expected label source breakdown for rural Sindh:**
```
OSM surface tag:      ~8%
OSM tracktype tag:    ~4%
Highway type:        ~58%
Pixel intensity:     ~29%
```

**Output fields added:**
- `condition` — Good / Damaged / Unpaved
- `label_source` — which method assigned the label
- `label_conf` — 0.0–1.0 confidence
- `review_flag` — True if confidence < 0.55

### Full Automated Pipeline Run

```bash
python normalize_tif.py \
    --safe_dir /data/S2B_MSIL2A_20241215T055149.SAFE \
    --aoi 24.8,68.1,26.3,70.5 \
    --out outputs/sindh_normalised_stack.tif

python build_road_mask.py \
    --tif outputs/sindh_normalised_stack.tif \
    --aoi 24.8,68.1,26.3,70.5 \
    --out outputs/road_mask.tif \
    --shp outputs/road_centrelines.shp

python label_conditions.py \
    --shp outputs/road_centrelines.shp \
    --tif outputs/sindh_normalised_stack.tif \
    --out outputs/road_centrelines_labelled.shp
```

After these 3 scripts, proceed directly to U-Net training (Stage 3) and EfficientNet training (Stage 4). No QGIS required.

> **Important limitation:** The majority of labels in rural Sindh will come from the highway type heuristic and pixel intensity fallback, not explicit OSM condition tags. Use `review_flag=True` segments as a prioritised list for targeted manual verification.

---

## 10. Application I/O Specification

### REST API Endpoints

#### Authentication
```
POST   /api/auth/register/
POST   /api/auth/login/
POST   /api/auth/logout/
POST   /api/auth/refresh/
GET    /api/auth/me/
```

#### Projects
```
GET    /api/projects/
POST   /api/projects/
GET    /api/projects/{id}/
PATCH  /api/projects/{id}/
DELETE /api/projects/{id}/
GET    /api/projects/{id}/jobs/
```

#### Jobs
```
POST   /api/projects/{project_id}/jobs/   Upload GeoTIFF + start inference
GET    /api/jobs/{job_id}/                Job status and metadata
GET    /api/jobs/{job_id}/result/         All result URLs (when complete)
DELETE /api/jobs/{job_id}/               Cancel or delete
```

**Upload response (immediate):**
```json
{
  "job_id":        "job_4ABC123",
  "status":        "pending",
  "stage":         "upload",
  "progress_pct":  0,
  "websocket_url": "wss://api.example.com/ws/jobs/job_4ABC123/"
}
```

**Job result response (when completed):**
```json
{
  "job_id":   "job_4ABC123",
  "status":   "completed",
  "downloads": {
    "seg_mask_tif":  "https://storage.../seg_mask.tif",
    "roads_geojson": "https://storage.../roads.geojson",
    "graph_geojson": "https://storage.../graph.geojson",
    "report_pdf":    "https://storage.../report.pdf",
    "report_csv":    "https://storage.../report.csv"
  },
  "stats": {
    "total_road_km": 142.3,
    "good_pct": 23.4,
    "damaged_pct": 18.1,
    "unpaved_pct": 58.5,
    "n_components": 47,
    "n_isolated": 12,
    "mean_confidence": 0.782
  }
}
```

#### Map Data Endpoints (Progressive Loading)
```
GET /api/jobs/{job_id}/layers/roads-geojson/bbox/
    ?minx=68.2&miny=24.9&maxx=68.4&maxy=25.1
```

**GeoJSON Feature format:**
```json
{
  "type": "Feature",
  "id": 1247,
  "geometry": { "type": "LineString", "coordinates": [...] },
  "properties": {
    "segment_id": 1247,
    "condition":  "Damaged",
    "confidence": 0.874,
    "prob_good":  0.02,
    "prob_damaged": 0.87,
    "prob_unpaved": 0.11,
    "length_m":   412.5,
    "component_id": 3,
    "betweenness":  0.023,
    "review_flag":  false
  }
}
```

### WebSocket Protocol

**Connection:**
```
WSS /ws/jobs/{job_id}/
Authorization: Bearer <token>
```

**Event envelope:**
```json
{
  "type":      "<event_type>",
  "job_id":    "job_4ABC123",
  "timestamp": "2026-04-20T14:25:12.341Z",
  "payload":   { ... }
}
```

**Event types:**

| Event | When |
|---|---|
| `stage_started` | Each pipeline stage begins |
| `progress_update` | Every 2 seconds during a stage |
| `stage_completed` | Stage finishes (with output URLs) |
| `job_completed` | All stages done |
| `job_failed` | Any stage errors |

**Error codes:**

| Code | Meaning | Recoverable |
|---|---|---|
| `CLOUD_COVER_TOO_HIGH` | > 20% cloud cover | No |
| `INSUFFICIENT_BANDS` | < 4 bands | No |
| `IMAGE_TOO_SMALL` | Below 256×256 | No |
| `NO_ROADS_DETECTED` | U-Net output = 0 road pixels | No |
| `SEGMENTATION_OOM` | GPU out of memory | Yes (retry) |
| `CLASSIFICATION_FAILED` | EfficientNet error | Yes |
| `STORAGE_UNAVAILABLE` | S3/storage failed | Yes |

### Partial Rendering Strategy

| After stage... | Map shows |
|---|---|
| preprocess | OSM basemap + AOI outline only |
| segment | Red semi-transparent mask overlay + "Classifying condition..." banner |
| classify | Colour-coded roads (green/red/grey), click for metadata popup |
| graph | Roads with betweenness-scaled thickness, connectivity toggle, shortest-path tool |
| report | Download buttons enabled |

### Frontend React Hook

```typescript
// hooks/useJobStream.ts
export function useJobStream(jobId: string, token: string) {
  const [state, setState] = useState<JobState>({ ... });

  useEffect(() => {
    const ws = new WebSocket(`wss://api.example.com/ws/jobs/${jobId}/`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setState(prev => {
        switch (msg.type) {
          case 'stage_started':    /* update stage + reset progress */
          case 'progress_update':  /* update progress_pct */
          case 'stage_completed':  /* merge outputs into state */
          case 'job_completed':    /* set status = completed */
          case 'job_failed':       /* set error */
        }
      });
    };
  }, [jobId]);

  return state;
}
```

### Map Condition Styling

```typescript
const conditionStyle = (feature) => ({
  color: {
    'Good':    '#2ecc71',
    'Damaged': '#e74c3c',
    'Unpaved': '#95a5a6',
  }[feature.properties.condition],
  weight:  1 + feature.properties.betweenness * 20,  // thickness by criticality
  opacity: feature.properties.review_flag ? 0.5 : 0.9,
});
```

---

## 11. End-to-End SentinelHub Inference Server

### Project Structure

```
inference_server/
├── artifacts/
│   ├── unet.pth
│   ├── efficientnet.pth
│   ├── pipeline_config.pkl
│   └── class_weights.pkl
├── inference_server/
│   ├── config.py              (Pydantic settings, env vars)
│   ├── sentinelhub_fetcher.py (Catalog API + least-cloudy scene)
│   ├── models.py              (model loaders)
│   ├── pipeline.py            (InferencePipeline orchestrator)
│   ├── stages/
│   │   ├── preprocess.py      (P1+P2)
│   │   ├── segment.py         (P3)
│   │   ├── classify.py        (P4)
│   │   ├── graph.py           (P5)
│   │   └── report.py          (P6)
│   └── api.py                 (FastAPI + Celery + WebSocket)
├── requirements.txt
├── Dockerfile
├── run_server.py
└── .env
```

### SentinelHub Evalscript

Returns B02, B03, B04, B08, SCL as a 5-band uint16 GeoTIFF in a single request:

```javascript
//VERSION=3
function setup() {
    return {
        input: [{ bands: ["B02","B03","B04","B08","SCL"], units: "DN" }],
        output: { bands: 5, sampleType: "UINT16" }
    };
}
function evaluatePixel(sample) {
    return [sample.B02, sample.B03, sample.B04, sample.B08, sample.SCL];
}
```

**Why single request:** Ensures perfect pixel alignment between spectral bands and SCL. Reduces API quota usage.

### SentinelHub Fetcher Logic

1. Use **Catalog API** to find the least-cloudy scene in the requested date range
2. Sort by `eo:cloud_cover` ascending
3. Request imagery for that specific scene date
4. Georeference raw numpy array using `from_bounds()` transform
5. Write as GeoTIFF with `rasterio.open(..., "w", ...)`

**AOI size limit:** 2500×2500 pixels at 10m (= 25km × 25km). Raise ValueError for larger requests.

### Pipeline Modes

```python
# Mode 1: Fetch from SentinelHub
result = pipeline.fetch_and_run(
    aoi_bbox        = (68.10, 24.80, 68.45, 25.15),
    start_date      = "2025-11-01",
    end_date        = "2025-12-15",
    region_name     = "Mithi subdistrict, Tharparkar",
    max_cloud_cover = 0.15,
    resolution_m    = 10,
)

# Mode 2: Use pre-supplied GeoTIFF
result = pipeline.run_on_tif(
    tif_path    = Path("my_file.tif"),
    region_name = "Custom region",
)
```

### API Endpoints

```
POST /api/jobs/fetch-and-run    Trigger SentinelHub fetch + pipeline
POST /api/jobs/upload-and-run   Run pipeline on uploaded GeoTIFF
GET  /api/jobs/{job_id}         Job status + progress
GET  /api/jobs/{job_id}/download/{file_key}   Download output file
WS   /ws/jobs/{job_id}          Real-time progress stream
GET  /api/health                Server health check
```

**Fetch-and-run request:**
```json
{
  "aoi_bbox":        [68.10, 24.80, 68.45, 25.15],
  "start_date":      "2025-11-01",
  "end_date":        "2025-12-15",
  "region_name":     "Mithi subdistrict, Tharparkar",
  "max_cloud_cover": 0.15,
  "resolution_m":    10
}
```

### Key Design Decisions

1. **Models load once at startup** via `@app.on_event("startup")` — held in GPU memory for all requests
2. **Celery workers** run inference (prevents blocking the async event loop)
3. **Redis pub/sub** relays progress events from workers to WebSocket clients
4. **`progress_callback(stage, pct, message)`** is threaded through all pipeline stages
5. **Two input modes** share identical P1–P6 stages after preprocessing begins
6. For **production cloud deployment**: replace `FileResponse` with presigned S3 URLs — pipeline code unchanged

### WebSocket Progress Event Sequence

```
fetch      →  0%, 100%                (SentinelHub download)
preprocess →  10%, 25%, 45%, 75%, 100%
segment    →  per-batch progress
classify   →  per-segment progress
graph      →  10%, 40%, 70%, 85%, 100%
report     →  10%, 50%, 80%, 100%
job_completed OR job_failed
```

### Running Locally

```bash
# Environment
cp .env.example .env
# Edit .env: add SH_CLIENT_ID, SH_CLIENT_SECRET

# Dependencies
pip install -r requirements.txt

# Start Redis
redis-server

# Start Celery worker
celery -A inference_server.api:celery_app worker --loglevel=info --concurrency=1

# Start API server
python run_server.py
# → http://localhost:8000
```

### Docker Deployment

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y gdal-bin libgdal-dev build-essential
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY inference_server ./inference_server
COPY artifacts        ./artifacts
COPY run_server.py    .
ENV ARTIFACTS_DIR=/app/artifacts
EXPOSE 8000
CMD ["python", "run_server.py"]
```

### Environment Variables

```bash
SH_CLIENT_ID=your-client-id-here
SH_CLIENT_SECRET=your-client-secret-here
SH_INSTANCE_ID=your-instance-id
ARTIFACTS_DIR=/app/artifacts
OUTPUT_DIR=/app/outputs
REDIS_URL=redis://localhost:6379/0
DEVICE=cuda
```

---

## 12. Stage-by-Stage Data Flow Summary

| Stage | Input | Output | Format |
|---|---|---|---|
| Upload | HTTP multipart POST | `uploads/{job_id}_input.tif` | Raw bytes |
| P1 Preprocess | `_input.tif` (any CRS/scale) | `normalised.tif` | float32, 4ch, 0–1, EPSG:32642 |
| P2 Segment | `normalised.tif` + U-Net | `seg_mask.tif` | uint8, 1ch, 0/1 |
| P3 Vectorise | `seg_mask.tif` | `roads_raw.shp` | LineString, EPSG:32642 |
| P4 Classify | `normalised.tif` + `roads_raw.shp` | `roads_classified.shp` | LineString + condition attrs |
| P4 CSV | `roads_classified.shp` | `report_data.csv` | 1 row/segment + WKT |
| P5 Graph | `roads_classified.shp` | `road_graph.graphml` | GraphML XML |
| P5 GeoJSON | same | `road_graph.geojson` | RFC 7946 GeoJSON, EPSG:4326 |
| P5 Components | same | `connected_components.csv` | 1 row/component |
| P6 PDF | all above | `Assessment_Report_{id}.pdf` | A4 PDF, embedded maps |
| P6 ZIP | `roads_classified.shp` | `report_vector_{id}.zip` | `.shp/.shx/.dbf/.prj` |

> The four artifact files (`unet.pth`, `efficientnet.pth`, `pipeline_config.pkl`, `class_weights.pkl`) never change between jobs. Everything in `outputs/{job_id}/` is written fresh per job.

---

*Generated from shared conversation — April 2026.*
