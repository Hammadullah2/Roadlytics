"""
config.py — Centralized configuration for the road segmentation + condition pipeline.

All paths, thresholds, class mappings, and device settings live here.
Override DRIVE_ROOT via the DRIVE_ROOT environment variable if your folder differs.
"""

import os
from pathlib import Path
import torch

# ── Root folder ────────────────────────────────────────────────────────────────
# Default: sibling of the road_pipeline package itself (i.e., the "proper fyp" folder)
_THIS_DIR = Path(__file__).resolve().parent          # road_pipeline/
_REPO_ROOT = _THIS_DIR.parent                        # proper fyp/

DRIVE_ROOT = Path(os.environ.get("DRIVE_ROOT", str(_REPO_ROOT)))

# ── Data sub-folders ───────────────────────────────────────────────────────────
RAW_DIR     = DRIVE_ROOT / "data" / "raw"
SEG_DIR     = DRIVE_ROOT / "data" / "segmentation masks"
CLS_DIR     = DRIVE_ROOT / "data" / "classification masks"
SHP_DIR     = DRIVE_ROOT / "data" / "classification shapefiles"
OSM_DIR     = DRIVE_ROOT / "data" / "pak OSM masks"

# ── Model weights ──────────────────────────────────────────────────────────────
WEIGHTS_DIR  = DRIVE_ROOT / "weights"
SEG_WEIGHTS  = WEIGHTS_DIR / "road segmentation.pth"
CLS_WEIGHTS  = WEIGHTS_DIR / "road_condition_model.pth"

# ── Segmentation constants ─────────────────────────────────────────────────────
TILE_SIZE          = 1024
STRIDE             = 512
REFLECTANCE_SCALE  = 10000.0
IN_CHANNELS        = 4
SEG_THRESHOLD      = 0.5          # CLI flag --seg-threshold overrides this
ENCODER_NAME       = "se_resnext101_32x4d"

# ── Classification constants ───────────────────────────────────────────────────
PATCH_SIZE  = 32
NUM_CLASSES = 3
BATCH_SIZE  = 256

# ── OSM rasterization ─────────────────────────────────────────────────────────
OSM_BUFFER_M = 5.0   # metres; CLI flag --osm-buffer-m overrides

# ── Post-processing ────────────────────────────────────────────────────────────
MIN_POLYGON_AREA_M2  = 200.0   # drop polygons smaller than this
SIMPLIFY_TOLERANCE_M = 10.0    # simplification tolerance in metres

# ── Class mapping (DO NOT SWAP — matches training code) ───────────────────────
# Model output index → human label
# 0 = Good   (dark paved asphalt)
# 1 = Unpaved (bright sand/dirt)
# 2 = Damaged (vegetation-covered / degraded)
CLASS_NAMES = ["good", "unpaved", "damaged"]   # index = model output index

# Raster value convention: each binary TIF has 1 = this class, 0 = everything else.
# Combined TIF uses 1 / 2 / 3.
CLASS_VALUES = {name: idx + 1 for idx, name in enumerate(CLASS_NAMES)}
# → {"good": 1, "unpaved": 2, "damaged": 3}

# ── QGIS / shapefile colors (RGBA) ────────────────────────────────────────────
CLASS_COLORS_RGBA = {
    "good":    (0,   200,   0, 255),   # green
    "damaged": (220,  40,  40, 255),   # red
    "unpaved": (230, 180,  60, 255),   # tan / golden
}

# ── Device ────────────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
