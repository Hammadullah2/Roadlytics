"""
config.py - Centralized configuration for the Roadlytics pipeline.

All paths, thresholds, class mappings, color rules, and device settings live
here. Override DRIVE_ROOT via the DRIVE_ROOT environment variable if your folder
differs.
"""

import os
from pathlib import Path

import torch

# Root folder
_THIS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _THIS_DIR.parent
DRIVE_ROOT = Path(os.environ.get("DRIVE_ROOT", str(_REPO_ROOT)))


def _candidate_match(directory: Path, tokens: tuple[str, ...]) -> Path | None:
    if not directory.exists():
        return None
    for path in sorted(directory.glob("*.pth")):
        lowered = path.name.lower()
        if all(token in lowered for token in tokens):
            return path
    return None


def _discover_weight(
    env_name: str,
    preferred_names: tuple[str, ...],
    token_match: tuple[str, ...],
) -> Path:
    override = os.environ.get(env_name)
    if override:
        return Path(override)

    search_roots = [
        Path(os.environ.get("ROADLYTICS_MODEL_WEIGHTS_DIR", DRIVE_ROOT / "model_weights")),
        DRIVE_ROOT / "weights",
    ]
    for root in search_roots:
        for name in preferred_names:
            candidate = root / name
            if candidate.exists():
                return candidate
        token_candidate = _candidate_match(root, token_match)
        if token_candidate is not None:
            return token_candidate
        single_candidate = sorted(root.glob("*.pth"))
        if len(single_candidate) == 1:
            return single_candidate[0]

    return search_roots[0] / preferred_names[0]


# Data sub-folders
RAW_DIR = DRIVE_ROOT / "data" / "raw"
SEG_DIR = DRIVE_ROOT / "data" / "segmentation masks"
CLS_DIR = DRIVE_ROOT / "data" / "classification masks"
SHP_DIR = DRIVE_ROOT / "data" / "classification shapefiles"
OSM_DIR = Path(os.environ.get("ROADLYTICS_OSM_DIR", DRIVE_ROOT / "data" / "osm_roads"))
ANALYTICS_DIR = DRIVE_ROOT / "data" / "analytics"

# Model weights
WEIGHTS_DIR = Path(os.environ.get("ROADLYTICS_MODEL_WEIGHTS_DIR", DRIVE_ROOT / "model_weights"))
SEG_WEIGHTS = _discover_weight(
    "ROADLYTICS_SEG_WEIGHTS",
    ("road segmentation.pth", "road_segmentation.pth", "road-segmentation.pth"),
    ("road", "seg"),
)
CLS_WEIGHTS = _discover_weight(
    "ROADLYTICS_CLS_WEIGHTS",
    ("road_condition_model.pth", "road-condition-model.pth", "road_condition.pth"),
    ("road", "condition"),
)

# Segmentation constants
TILE_SIZE = 1024
STRIDE = 512
REFLECTANCE_SCALE = 10000.0
IN_CHANNELS = 4
SEG_THRESHOLD = 0.5
ENCODER_NAME = "se_resnext101_32x4d"

# Classification constants
PATCH_SIZE = 32
NUM_CLASSES = 3
BATCH_SIZE = 256

# OSM rasterization
OSM_BUFFER_M = 5.0

# Post-processing
MIN_POLYGON_AREA_M2 = 200.0
SIMPLIFY_TOLERANCE_M = 10.0

# Class mapping (DO NOT SWAP - matches training code)
CLASS_NAMES = ["good", "unpaved", "damaged"]
CLASS_VALUES = {name: idx + 1 for idx, name in enumerate(CLASS_NAMES)}
CLASS_ID_TO_NAME = {value: name for name, value in CLASS_VALUES.items()}

# QGIS / raster colors (RGBA)
CLASS_COLORS_RGBA = {
    "good": (34, 139, 34, 255),
    "unpaved": (214, 57, 42, 255),
    "damaged": (240, 196, 25, 255),
}
RASTER_COLOR_TABLE = {
    0: (0, 0, 0, 0),
    1: CLASS_COLORS_RGBA["good"],
    2: CLASS_COLORS_RGBA["unpaved"],
    3: CLASS_COLORS_RGBA["damaged"],
}

# Stage 5 connectivity defaults
CONNECTIVITY_DIRNAME = "connectivity"
CONNECTIVITY_COSTS = {
    "good": 1.0,
    "unpaved": 2.0,
    "damaged": 3.5,
}
CONNECTIVITY_ISOLATION_THRESHOLD = 50
CONNECTIVITY_SAMPLE_LIMIT = 64
CONNECTIVITY_CRITICAL_PERCENTILE = 95.0
CONNECTIVITY_NEIGHBORHOOD = 4

# Device
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
