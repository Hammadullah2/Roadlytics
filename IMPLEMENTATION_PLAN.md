# Unified Road Segmentation + Condition Classification Pipeline — Implementation Plan

**Goal:** Build a single-entry inference pipeline that takes a Sentinel-2 `.tif` from `data/raw/`, lets the user choose a segmentation source (DeepLabV3+ model **OR** Pakistan OSM shapefile), lets the user choose a classification method (EfficientNet-B2 **OR** K-Means), and produces three per-condition raster masks (`good`, `damaged`, `unpaved`) plus optional per-condition vector shapefiles ready to toggle in QGIS with distinct colors.

> **Naming note:** The user referred to the second classification option as "KNN". The uploaded `road_condition_mask.py` actually uses **K-Means** clustering (unsupervised, 3 clusters over `[B, G, R, NIR, NDVI, brightness]` with StandardScaler). This plan uses "K-Means" to match the code. If the user actually wants KNN (supervised, nearest-neighbor on labeled training data), that's a different algorithm and the plan needs adjustment.

---

## 1. Model & Data Facts (pulled from the two training files)

### Segmentation — `stage3_deeplabv3_colab.py`

| Setting | Value |
|---|---|
| Architecture | `smp.DeepLabV3Plus` |
| Encoder | `se_resnext101_32x4d` (ImageNet init) |
| Input channels | 4 (B02 Blue, B03 Green, B04 Red, B08 NIR) |
| Output classes | 1 (binary road) |
| Tile size | **1024** |
| Stride | **512** (50% overlap) |
| Reflectance scale | divide by 10000 → [0,1] |
| Threshold | 0.3 (train code) / 0.5 (Cell 13b unseen-image code) — **we will expose as a CLI flag, default 0.5** |
| Post-processing | morphological closing with 5×5 cross kernel |
| Weights file | `road segmentation.pth` (~192 MB state_dict only) |
| Target CRS | EPSG:32642 (UTM 42N, Sindh) |

### Classification — `road_condition_mask.py`

| Setting | Value |
|---|---|
| Architecture | `torchvision.models.efficientnet_b2` (ImageNet init during training) |
| Stem conv | Patched to 4 input channels (weights[:, :3] = ImageNet, weights[:, 3] = mean of 3) |
| Classifier head | `nn.Linear(in_features, 3)` |
| Patch size | 32×32 centered on each road pixel |
| Reflectance scale | /10000 |
| Padding | reflect, pad = PATCH_SIZE // 2 = 16 |
| Batch size | 256 |
| Weights file | `road condition model.pth` (~30 MB) |

### Class mapping (from training code — **critical, do not swap**)

Model output index → human label:

- `0` → **Good** (Cluster 1, dark paved asphalt)
- `1` → **Unpaved** (Cluster 2, bright sand/dirt)
- `2` → **Damaged** (Cluster 3, vegetation-covered / degraded)

Raster value convention (how we will write the 3 output TIFs): each output is **binary uint8** (1 = pixel belongs to that class, 0 = everything else). An optional 4th combined TIF can use values 1/2/3.

### K-Means option — from `road_condition_mask.py` Phase 1

- Features per road pixel: `[blue, green, red, nir, NDVI, brightness]` where `NDVI = (NIR − R) / (NIR + R + 1e-8)`, `brightness = (B + G + R) / 3`
- `StandardScaler` fit on the road-pixel subset
- `KMeans(n_clusters=3, random_state=42, n_init=10)`
- Cluster → label mapping is **not stable across images** (KMeans labels are arbitrary). We must deterministically relabel using the centroid rule the training code relies on:
  - Highest mean brightness → Unpaved
  - Highest mean NDVI → Damaged
  - Remaining cluster → Good
  - (This matches the "corrected mapping" comment in the user's code.)

---

## 2. Target Drive Layout

User-described layout, with one new folder added for vector outputs:

```
proper fyp/
├── weights/
│   ├── road condition model.pth
│   └── road segmentation.pth
└── data/
    ├── raw/                         # input .tif
    │   └── sindh_stacked_clipped1.tif
    ├── pak OSM masks/               # Pakistan OSM shapefile bundle
    │   ├── gis_osm_roads_free_1.shp (+ .shx .dbf .prj .cpg)
    ├── segmentation masks/          # output of segmentation stage (road mask .tif)
    ├── classification masks/        # 3× per-condition .tif outputs
    ├── classification shapefiles/   # NEW — 3× per-condition .shp outputs (+ optional .qml)
    └── kmeans masks/                   # (existing, legacy K-Means outputs; not rewritten)
```

---

## 3. Project Structure to Build

Create a new Python package next to the existing `inference_server_project`. Keep it self-contained so it runs standalone or can later be wired into the FastAPI server.

```
road_pipeline/
├── config.py                       # paths, thresholds, class mapping, device
├── io_utils.py                     # rasterio read/write helpers, CRS checks
├── segmentation/
│   ├── __init__.py
│   ├── deeplabv3.py                # load weights, sliding-window inference → binary mask .tif
│   └── osm_to_mask.py              # clip OSM shapefile to raster bbox → binary mask .tif
├── classification/
│   ├── __init__.py
│   ├── efficientnet.py             # load weights, per-road-pixel patch inference → 3 TIFs
│   └── kmeans.py                   # K-Means over road pixels, centroid-based relabel → 3 TIFs
├── postprocess/
│   ├── __init__.py
│   └── raster_to_vector.py         # polygonize each binary TIF → .shp (+ .qml color style)
├── pipeline.py                     # orchestrator: segmentation choice → classification choice → vectorize
└── cli.py                          # argparse or interactive prompts for the two user choices
```

---

## 4. Step-by-Step Implementation

### Step 0 — Environment & dependencies

Add to `requirements.txt`:

```
rasterio
segmentation-models-pytorch==0.3.3
torch  torchvision
albumentations
geopandas  shapely  pyproj  fiona
numpy  opencv-python  scikit-learn
tqdm
```

Note: GDAL must be installed at the OS level (`apt-get install gdal-bin libgdal-dev`).

### Step 1 — `config.py`

Centralize:

- `DRIVE_ROOT = Path("My Drive/fyp test")` (configurable via env var `DRIVE_ROOT`)
- `RAW_DIR`, `SEG_DIR`, `CLS_DIR`, `SHP_DIR`, `OSM_DIR`, `WEIGHTS_DIR`
- `SEG_WEIGHTS = WEIGHTS_DIR / "road segmentation.pth"`
- `CLS_WEIGHTS = WEIGHTS_DIR / "road condition model.pth"`
- Segmentation constants: `TILE_SIZE=1024`, `STRIDE=512`, `REFLECTANCE_SCALE=10000.0`, `IN_CHANNELS=4`, `SEG_THRESHOLD=0.5` (expose as flag), `ENCODER_NAME="se_resnext101_32x4d"`
- Classification constants: `PATCH_SIZE=32`, `NUM_CLASSES=3`, `BATCH_SIZE=256`
- `CLASS_NAMES = ["good", "unpaved", "damaged"]` (index = model output index)
- `CLASS_COLORS_RGBA = {"good": (0, 200, 0, 255), "damaged": (220, 40, 40, 255), "unpaved": (230, 180, 60, 255)}`
- `DEVICE = "cuda" if torch.cuda.is_available() else "cpu"`

### Step 2 — `io_utils.py`

Thin wrappers to avoid rasterio boilerplate everywhere:

- `read_stack(path) -> (np.ndarray[4,H,W] float32 in [0,1], profile)`
- `read_mask(path) -> (np.ndarray[H,W] uint8, profile)`
- `write_binary_mask(path, mask, profile)` — sets `dtype=uint8, count=1, nodata=0, compress=lzw`
- `assert_crs_32642(profile)` — warn if the input raster is not in EPSG:32642; offer to reproject.

### Step 3 — Segmentation path A: DeepLabV3+ (`segmentation/deeplabv3.py`)

Port the logic from `run_custom_inference` in Cell 13b of the training script, cleaned up:

1. Build the exact same `smp.DeepLabV3Plus(encoder_name='se_resnext101_32x4d', encoder_weights=None, in_channels=4, classes=1, activation=None)` — use `encoder_weights=None` at inference time to skip the ImageNet download.
2. `load_state_dict(torch.load(SEG_WEIGHTS, map_location=device))` then `eval()`.
3. Open the raw TIF with rasterio, copy its profile.
4. Sliding window with `TILE_SIZE=1024`, `STRIDE=512`, reflect-pad edges:
   - For each window, read from disk via `rasterio.windows.Window` to save RAM.
   - Scale by `/10000`, clip to [0,1], pad short edges with zeros to 1024×1024.
   - Forward pass → `sigmoid` → accumulate into `pred_sum[H,W]` and `pred_count[H,W]`.
5. `pred_avg = pred_sum / max(pred_count, 1e-6)`; binary = `pred_avg > SEG_THRESHOLD`.
6. Morphological closing with 5×5 cross kernel (exactly as in training Cell 11).
7. Save to `data/segmentation masks/{raw_stem}_seg_deeplab.tif` preserving profile.
Returns the output path.

### Step 4 — Segmentation path B: OSM shapefile → mask (`segmentation/osm_to_mask.py`)

This is the "ground truth" option the user asked for.

1. Open the raw TIF; grab `src.bounds`, `src.transform`, `src.crs`, `src.height`, `src.width`.
2. Open the OSM shapefile with `geopandas.read_file(OSM_DIR / 'gis_osm_roads_free_1.shp')`.
3. **Clip before reprojecting** (faster): compute the raster bbox in the *shapefile's* CRS (probably EPSG:4326), then `gdf.cx[minx:maxx, miny:maxy]` to filter intersecting features.
4. Reproject the filtered subset to the raster's CRS (EPSG:32642) with `gdf.to_crs(src.crs)`.
5. Intersect precisely with the raster footprint polygon (clean up features that only clipped via bbox).
6. **Buffer the LineStrings** to give them width. Sentinel-2 pixels are 10 m; real roads are ~5–15 m. Use a per-class buffer via the OSM `fclass` attribute if available (e.g., motorway=12 m, trunk=10 m, primary=8 m, residential=4 m); otherwise a flat 5 m buffer. This is a **key parameter the user should be able to tune** — expose as `--osm-buffer-m` with a sensible default.
7. Rasterize with `rasterio.features.rasterize(shapes, out_shape=(H,W), transform=transform, fill=0, default_value=1, dtype='uint8')`.
8. Save to `data/segmentation masks/{raw_stem}_seg_osm.tif` using the raw TIF's profile (updated to uint8, 1 band).
Returns the output path.

### Step 5 — Classification path A: EfficientNet-B2 (`classification/efficientnet.py`)

Port the final inference cell from `road_condition_mask.py`:

1. Build the model exactly as in training:

   ```python
   backbone = models.efficientnet_b2(weights=None)
   old = backbone.features[0][0]
   new = nn.Conv2d(4, old.out_channels, kernel_size=old.kernel_size,
                   stride=old.stride, padding=old.padding, bias=False)
   backbone.features[0][0] = new
   backbone.classifier[1] = nn.Linear(backbone.classifier[1].in_features, 3)
   ```

   *(Do not re-copy ImageNet weights at inference — we overwrite everything with the checkpoint.)*
2. `load_state_dict(torch.load(CLS_WEIGHTS, map_location=device))`, `eval()`.
3. Load raw TIF → normalize `/10000`, clip to [0,10000] first. Pad with `np.pad(mode='reflect', pad=16)` on H,W axes.
4. Load binary road mask from Step 3 or Step 4 → `road_pixels = np.argwhere(mask == 1)`.
5. Build an `InferenceDataset` (already in training code) that yields 32×32×4 patches centered on each road pixel.
6. Batched forward pass (`batch_size=256`, `num_workers=2`). Collect `argmax` per pixel.
7. Build a single `prediction_map[H,W] uint8` where each road pixel gets `class_index + 1` (1=good, 2=unpaved, 3=damaged); non-road stays 0.
8. **Split into three binary TIFs**:
   - `good.tif = (prediction_map == 1).astype(uint8)`
   - `unpaved.tif = (prediction_map == 2).astype(uint8)`
   - `damaged.tif = (prediction_map == 3).astype(uint8)`
9. Save all three to `data/classification masks/{raw_stem}_{method}_{class}.tif` preserving the input raster's profile. Also save a combined `{raw_stem}_{method}_combined.tif` with values 0/1/2/3 for convenience.

### Step 6 — Classification path B: K-Means (`classification/kmeans.py`)

Port Phase 1 of `road_condition_mask.py`:

1. Load raw TIF → float32, compute NDVI and brightness on the full raster.
2. Select the road pixels from the mask.
3. Stack features `[B, G, R, NIR, NDVI, brightness]` of shape `(N, 6)`.
4. `StandardScaler().fit_transform(features)`.
5. `KMeans(n_clusters=3, random_state=42, n_init=10).fit_predict(...)`.
6. **Deterministic relabel** (K-Means cluster IDs are arbitrary; we must map them to good/unpaved/damaged the same way every run):
   - Compute per-cluster means in the **original unscaled** feature space.
   - Cluster with **max mean brightness** → `unpaved` (label 2).
   - Cluster with **max mean NDVI** → `damaged` (label 3).
   - Remaining cluster → `good` (label 1).
7. Build `prediction_map[H,W] uint8` identical to EfficientNet output schema.
8. Split into three binary TIFs with the same naming convention.

> Because both classifiers emit the **same schema** (`{stem}_{method}_{class}.tif`), downstream vectorization code is shared.

### Step 7 — Raster → Shapefile with colors (`postprocess/raster_to_vector.py`)

**Answer to "can the TIFs be converted to shapefiles, lighter, with toggleable colors?"** — **Yes.** Plan:

1. For each of the three class TIFs:
   - Open with rasterio, run `rasterio.features.shapes(mask, mask=(mask==1), transform=transform)`.
   - Drop tiny polygons (< `min_area_m2`, default 200 m²) to suppress pixel-level noise.
   - Optionally simplify with `shape.simplify(tolerance=10.0, preserve_topology=True)` to kill the pixel staircase.
   - Build a `GeoDataFrame` with columns `condition` (string), `area_m2` (float), `geometry` (Polygon / MultiPolygon). Use the raster's CRS.
   - Save to `data/classification shapefiles/{raw_stem}_{method}_{class}.shp`.
2. **Colors for toggling:** two complementary approaches — ship both so the user can pick.
   - **(a) One shapefile per class (recommended for toggling):** three separate `.shp` files — this is how QGIS layer panel lets users toggle on/off individually. Each file has a sibling `.qml` QGIS style file that sets the fill color (green / red / tan). Writing a `.qml` is just writing a small XML template — cheap and no external deps.
   - **(b) One combined shapefile with a `condition` attribute:** single file, use "Categorized" symbology in QGIS keyed on `condition`. Convenient but toggling one class means editing the symbology. We generate this too so both workflows are supported.
3. (Optional nicety) export a matching **GeoJSON** per class — even lighter than Shapefile, natively web-viewable, and keeps attribute names (Shapefile truncates to 10 chars).

**Why the shapefile is "lighter":** a dense raster at 10 m resolution over a large scene is tens of MB even with LZW; the same information as simplified polygons is typically an order of magnitude smaller because roads are sparse. The simplification tolerance is the main knob to balance size vs. fidelity.

### Step 8 — Orchestrator & CLI (`pipeline.py`, `cli.py`)

`cli.py` presents the user with two choices. Two modes supported:

**Flag mode** (scriptable):

```
python -m road_pipeline.cli \
    --input "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter {deeplab | osm} \
    --classifier {efficientnet | kmeans} \
    [--seg-threshold 0.5] \
    [--osm-buffer-m 5] \
    [--min-polygon-area-m2 200] \
    [--simplify-tolerance-m 10] \
    [--emit-shapefiles | --no-emit-shapefiles] \
    [--emit-geojson | --no-emit-geojson]
```

**Interactive mode** (if no flags given): two `input()` prompts asking the user to pick 1/2 for segmenter and 1/2 for classifier. Use this because the user wants "the user to have an option."

`pipeline.py::run(input_tif, segmenter, classifier, ...)`:

1. Resolve output paths using `{raw_stem}_{method}` naming.
2. Call either `segmentation.deeplabv3.run(...)` or `segmentation.osm_to_mask.run(...)` → path to segmentation mask TIF.
3. Call either `classification.efficientnet.run(stack_path, mask_path, ...)` or `classification.kmeans.run(stack_path, mask_path, ...)` → 3 class TIF paths.
4. If shapefiles requested, call `postprocess.raster_to_vector.run(class_tifs, ...)` → 3 shapefiles + 3 `.qml` files + 1 combined shapefile (+ optional GeoJSON).
5. Print a summary table of every file produced with size on disk.

---

## 5. Edge Cases & Gotchas

1. **CRS mismatch between the raw TIF and the OSM shapefile.** OSM is typically EPSG:4326; the raw TIF is EPSG:32642. Reproject after bbox-clipping, not before, for speed.
2. **OSM roads are LineStrings with no width.** Without buffering, `rasterize` produces 1-pixel-wide lines that often miss road centerlines at 10 m resolution. Buffer is **required**; default 5 m may need tuning for your region.
3. **K-Means label ordering is non-deterministic across runs / images.** The centroid-based relabel in Step 6 fixes this; do not skip it.
4. **Large rasters = memory pressure.** The DeepLab segmenter reads windows from disk (good). The EfficientNet classifier currently loads the full normalized + padded raster into RAM — fine for the provided test TIF (a clipped subset) but could OOM on the full Sindh stack. If OOM is observed, switch to windowed reads there too.
5. **`segmentation-models-pytorch` version.** Training used `0.3.3`. Pinning avoids API drift in later versions.
6. **Weights filename has a space** (`road segmentation.pth`). Code must quote paths; consider renaming to `road_segmentation.pth` at the start.
7. **Threshold difference (0.3 vs 0.5).** The training Cell 11 uses 0.3, Cell 13b uses 0.5. On unseen data, 0.5 is safer. Expose as a flag.
8. **EfficientNet-B2 inference model build** must exactly match training stem conv + head sizes, otherwise `load_state_dict` will raise. The plan in Step 5 matches the training code.
9. **Shapefile 10-character column name truncation** — keep attribute names short (`condition`, `area_m2`, `road_id`).
10. **Output naming must be collision-free** when a user re-runs with a different segmenter/classifier combo on the same input. Encoding `{method}` in the filename handles this.

---

## 6. Verification Plan (do NOT skip)

After implementation, Sonnet should validate with:

1. **Smoke test:** run the four combinations (deeplab + effnet, deeplab + kmeans, osm + effnet, osm + kmeans) on `sindh_stacked_clipped1.tif`. Every run must produce 1 segmentation TIF + 3 class TIFs + 3 shapefiles + combined shapefile without errors.
2. **Georeferencing check:** open the output TIFs and the source TIF in QGIS or via `rasterio.open(...).crs` / `.transform` and assert they match exactly. Output shapefile CRS must match too.
3. **Value sanity checks:**
   - Each class binary TIF has values in {0, 1}.
   - Sum over the three class TIFs equals the segmentation mask (no road pixel is unclassified, no pixel is double-classified).
   - K-Means cluster → label mapping: log the centroid means and the chosen mapping — verify "unpaved" has highest brightness, "damaged" has highest NDVI.
4. **Visual preview:** save a side-by-side PNG (RGB composite + segmentation + colored condition overlay) for each run, similar to the training Cell 12 previews.
5. **Shapefile integrity:** `fiona.open(shp).schema` shows the correct attribute types; `len(gdf)` matches the number of non-trivial polygons; total `area_m2` sums are close to the pixel-count area from the raster (within 1–2% after simplification).

---

## 7. User-Confirmed Decisions (LOCKED — do not re-ask)

1. **Classifier option B is K-Means**, not KNN. The class name in `cli.py` must be `kmeans`. User explicitly confirmed this.
2. **OSM buffer width: flat 5 m default.** Do *not* implement the per-`fclass` table. Keep `--osm-buffer-m` as a CLI flag so it can still be tuned later, but the default is 5.
3. **Shapefile output is Option A only:** one `.shp` per class, each with a sibling `.qml` QGIS style file containing its fill color (good=green, damaged=red, unpaved=tan — from the `CLASS_COLORS_RGBA` table in `config.py`). **Do not** emit a combined shapefile with a `condition` attribute — the user does not want Option B.
4. **Interactive prompts + CLI flags:** implement both. If the user runs `cli.py` with no `--segmenter` / `--classifier`, fall back to `input()` prompts.
5. **GeoJSON outputs:** not required (user did not opt in). Do not emit them. Leave the `--emit-geojson` flag out of the CLI to keep the interface simple.
6. **`knn masks/` folder:** leave untouched. Nothing in the new pipeline writes or reads it.

---

## 8. Handoff to Sonnet

Sonnet should:

1. Skip clarifying questions — §7 locks every decision.
2. Scaffold `road_pipeline/` per §3.
3. Implement modules in order: `config` → `io_utils` → `segmentation/deeplabv3` → `segmentation/osm_to_mask` → `classification/efficientnet` → `classification/kmeans` → `postprocess/raster_to_vector` → `pipeline` → `cli`.
4. Run the verification suite in §6 (four segmenter × classifier combinations on `sindh_stacked_clipped1.tif`).
5. Deliver a short README with the four example invocations and output file locations.
