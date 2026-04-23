# Road Pipeline

Unified inference pipeline: **Sentinel-2 GeoTIFF → road mask → per-condition rasters → QGIS-ready shapefiles**.

## Quick start

```bash
# From the "proper fyp" folder
python -m road_pipeline.cli \
    --input "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter deeplab \
    --classifier efficientnet
```

Omit `--segmenter` / `--classifier` to be prompted interactively.

---

## Four example invocations

### 1. DeepLabV3+ + EfficientNet-B2 (recommended for highest accuracy)
```bash
python -m road_pipeline.cli \
    --input  "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter   deeplab \
    --classifier  efficientnet
```

### 2. DeepLabV3+ + K-Means
```bash
python -m road_pipeline.cli \
    --input  "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter   deeplab \
    --classifier  kmeans
```

### 3. OSM shapefile + EfficientNet-B2
```bash
python -m road_pipeline.cli \
    --input  "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter   osm \
    --classifier  efficientnet \
    --osm-buffer-m 5
```

### 4. OSM shapefile + K-Means
```bash
python -m road_pipeline.cli \
    --input  "data/raw/sindh_stacked_clipped1.tif" \
    --segmenter   osm \
    --classifier  kmeans \
    --osm-buffer-m 5
```

---

## Output file locations

| File pattern | Location |
|---|---|
| `{stem}_seg_deeplab.tif` | `data/segmentation masks/` |
| `{stem}_seg_osm.tif` | `data/segmentation masks/` |
| `{stem}_{seg}_{cls}_good.tif` | `data/classification masks/` |
| `{stem}_{seg}_{cls}_unpaved.tif` | `data/classification masks/` |
| `{stem}_{seg}_{cls}_damaged.tif` | `data/classification masks/` |
| `{stem}_{seg}_{cls}_combined.tif` | `data/classification masks/` |
| `{stem}_{seg}_{cls}_good.shp` + `.qml` | `data/classification shapefiles/` |
| `{stem}_{seg}_{cls}_unpaved.shp` + `.qml` | `data/classification shapefiles/` |
| `{stem}_{seg}_{cls}_damaged.shp` + `.qml` | `data/classification shapefiles/` |

Replace `{stem}` with your TIF filename stem (e.g. `sindh_stacked_clipped1`),
`{seg}` with `deeplab` or `osm`, and `{cls}` with `efficientnet` or `kmeans`.

---

## Key CLI flags

| Flag | Default | Description |
|---|---|---|
| `--seg-threshold` | `0.5` | DeepLabV3+ probability threshold |
| `--osm-buffer-m` | `5` | OSM road buffer radius (metres) |
| `--min-polygon-area-m2` | `200` | Minimum shapefile polygon area |
| `--simplify-tolerance-m` | `10` | Polygon simplification tolerance |
| `--no-emit-shapefiles` | — | Disable shapefile output |
| `--device` | auto | `cuda` or `cpu` |

---

## Folder structure required

```
proper fyp/
├── weights/
│   ├── road segmentation.pth       # DeepLabV3+ weights (~192 MB)
│   └── road_condition_model.pth    # EfficientNet-B2 weights (~30 MB)
└── data/
    ├── raw/                         # Put your .tif here
    ├── pak OSM masks/               # gis_osm_roads_free_1.shp (+ siblings)
    ├── segmentation masks/          # Created automatically
    ├── classification masks/        # Created automatically
    └── classification shapefiles/   # Created automatically
```

---

## QGIS workflow

1. Open QGIS and add the three `.shp` files from `classification shapefiles/`.
2. Each shapefile has a sibling `.qml` style file — QGIS should auto-load it.
   If not: right-click layer → *Properties → Style → Load Style* → select the `.qml`.
3. Toggle individual layers on/off in the Layers panel to compare road conditions.

Colors: **good** = green, **damaged** = red, **unpaved** = tan/gold.
