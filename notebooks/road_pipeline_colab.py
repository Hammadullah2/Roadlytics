# =============================================================================
# Road Pipeline — Google Colab Runner
# =============================================================================
# Unified road segmentation + condition classification pipeline.
# Reads all data from Google Drive, writes all outputs back to Drive.
#
# Expected Drive layout at  My Drive/fyp test/ :
#
#   road_pipeline/               <- pipeline package (copy this repo folder to Drive)
#   data/
#     raw/                       <- put your Sentinel-2 .tif here
#     pak OSM masks/             <- gis_osm_roads_free_1.shp + .shx .dbf .prj .cpg
#     segmentation masks/        <- auto-created, segmentation output TIFs
#     classification masks/      <- auto-created, condition TIFs
#     classification shapefiles/ <- auto-created, .shp + .qml files
#   weights/
#     road segmentation.pth      <- DeepLabV3+ weights (~192 MB)
#     road_condition_model.pth   <- EfficientNet-B2 weights (~30 MB)
#
# USAGE:
#   1. Upload this script + the road_pipeline/ folder to your Drive.
#   2. Open a new Colab notebook, add a code cell, paste:
#        exec(open("/content/drive/MyDrive/fyp test/notebooks/road_pipeline_colab.py").read())
#      OR run each section's code manually by copying the blocks below.
#   3. In Section 3, set SEGMENTER and CLASSIFIER then run Section 4.
# =============================================================================


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — Install dependencies (run once per Colab session, ~2 min)
# ─────────────────────────────────────────────────────────────────────────────

import subprocess, sys

def _pip(*packages):
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", *packages],
        check=True,
    )

print("Installing dependencies …")
_pip(
    "rasterio>=1.3",
    "geopandas>=0.13",
    "shapely>=2.0",
    "pyproj>=3.5",
    "fiona>=1.9",
    "albumentations>=1.3",
    "segmentation-models-pytorch==0.3.3",
    "opencv-python-headless",
    "tqdm",
)
print("Dependencies ready.\n")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — Mount Google Drive + configure paths
# ─────────────────────────────────────────────────────────────────────────────

from google.colab import drive
drive.mount("/content/drive")

import os
from pathlib import Path

# Project root on Google Drive — matches the layout in the implementation plan
DRIVE_ROOT = Path("/content/drive/MyDrive/fyp test")

# Set env var BEFORE importing road_pipeline so config.py picks it up
os.environ["DRIVE_ROOT"] = str(DRIVE_ROOT)

# Make road_pipeline package importable
if str(DRIVE_ROOT) not in sys.path:
    sys.path.insert(0, str(DRIVE_ROOT))

# Sanity-check all critical paths before doing anything else
print("Path check:")
_checks = [
    ("road_pipeline package",  DRIVE_ROOT / "road_pipeline"),
    ("Raw TIF folder",         DRIVE_ROOT / "data" / "raw"),
    ("OSM shapefile",          DRIVE_ROOT / "data" / "pak OSM masks" / "gis_osm_roads_free_1.shp"),
    ("Segmentation weights",   DRIVE_ROOT / "weights" / "road segmentation.pth"),
    ("Classification weights", DRIVE_ROOT / "weights" / "road_condition_model.pth"),
]
_all_ok = True
for _label, _path in _checks:
    _exists = _path.exists()
    print(f"  [{'OK' if _exists else 'MISSING'}] {_label}")
    if not _exists:
        _all_ok = False

if not _all_ok:
    raise FileNotFoundError(
        "\nSome required paths are MISSING.\n"
        "Check your Drive layout matches the implementation plan "
        "(My Drive/fyp test/ should contain road_pipeline/, data/, weights/)."
    )
print()


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — Choose your run mode
# ─────────────────────────────────────────────────────────────────────────────
#
# SEGMENTER options:
#   "osm"     — rasterise Pakistan OSM roads shapefile
#               No GPU needed. Fast (~2-5 min). Best for quick results.
#
#   "deeplab" — DeepLabV3+ SE-ResNeXt-101 neural network
#               GPU strongly recommended (Runtime > Change runtime type > GPU).
#               Without GPU: ~3-5 hours on this image size. With GPU: ~10 min.
#
# CLASSIFIER options:
#   "kmeans"       — unsupervised K-Means clustering on road pixels
#                    No weights needed. Fast (~1-3 min). Good baseline.
#
#   "efficientnet" — trained EfficientNet-B2 (requires road_condition_model.pth)
#                    With GPU: ~5-20 min. Without GPU: ~30-60 min.
#
# Recommended order to try:
#   1st run:  osm + kmeans        (fastest, no GPU, see outputs within minutes)
#   2nd run:  osm + efficientnet  (compare trained vs unsupervised classification)
#   3rd run:  deeplab + kmeans    (see DeepLab segmentation quality)
#   4th run:  deeplab + efficientnet  (full trained pipeline)
#
# Just change the values below and re-run Section 4.

SEGMENTER  = "osm"      # "osm"  or  "deeplab"
CLASSIFIER = "kmeans"   # "kmeans"  or  "efficientnet"

# Input TIF — auto-picks the first .tif in data/raw/.
# Set manually if you have multiple TIFs, e.g.:
#   INPUT_TIF = DRIVE_ROOT / "data" / "raw" / "sindh_stack_clipped1.tif"
RAW_DIR = DRIVE_ROOT / "data" / "raw"
_tifs = sorted(RAW_DIR.glob("*.tif"))
if not _tifs:
    raise FileNotFoundError(f"No .tif files found in {RAW_DIR}")
INPUT_TIF = _tifs[0]

import torch
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

print("=" * 60)
print("Run configuration")
print("=" * 60)
print(f"  Input TIF  : {INPUT_TIF.name}")
print(f"  Segmenter  : {SEGMENTER}")
print(f"  Classifier : {CLASSIFIER}")
print(f"  Device     : {DEVICE}")
if DEVICE == "cpu" and SEGMENTER == "deeplab":
    print("\n  WARNING: DeepLab on CPU will be very slow (~3-5 hours).")
    print("  Go to Runtime > Change runtime type > GPU and restart.")
print()


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — Run the pipeline
# ─────────────────────────────────────────────────────────────────────────────

from road_pipeline.pipeline import run

results = run(
    input_tif       = INPUT_TIF,
    segmenter       = SEGMENTER,
    classifier      = CLASSIFIER,
    device          = DEVICE,
    emit_shapefiles = True,
)

print("\n" + "=" * 60)
print("COMPLETE — files written to Drive:")
print("=" * 60)
print(f"  Segmentation mask  : {results['seg_mask'].relative_to(DRIVE_ROOT)}")
for cls_name, p in results["class_tifs"].items():
    print(f"  {cls_name:10s} TIF   : {p.relative_to(DRIVE_ROOT)}")
for shp in results["shapefiles"]:
    print(f"  Shapefile          : {shp.relative_to(DRIVE_ROOT)}")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 (optional) — Run all 4 combinations in sequence
# ─────────────────────────────────────────────────────────────────────────────
# Uncomment the block below to run all four segmenter × classifier combos
# one after the other. Each combo produces its own output files so nothing
# is overwritten. Expect several hours without a GPU.

# COMBOS = [
#     ("osm",     "kmeans"),
#     ("osm",     "efficientnet"),
#     ("deeplab", "kmeans"),
#     ("deeplab", "efficientnet"),
# ]
#
# import torch
# _device = "cuda" if torch.cuda.is_available() else "cpu"
#
# from road_pipeline.pipeline import run as _run
# for _seg, _clf in COMBOS:
#     print(f"\n{'='*60}")
#     print(f"Running: {_seg} + {_clf}")
#     print(f"{'='*60}")
#     _run(
#         input_tif       = INPUT_TIF,
#         segmenter       = _seg,
#         classifier      = _clf,
#         device          = _device,
#         emit_shapefiles = True,
#     )
#     print(f"Done: {_seg} + {_clf}\n")
