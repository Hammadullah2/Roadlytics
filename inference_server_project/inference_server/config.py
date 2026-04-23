"""Central configuration loaded from environment variables."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Paths — project root is one level above inference_server_project
    project_root:   Path = Path(os.getenv(
        "PROJECT_ROOT",
        str(Path(__file__).resolve().parent.parent.parent)))  # → proper fyp/

    artifacts_dir:  Path = Path(os.getenv("ARTIFACTS_DIR", ""))
    output_dir:     Path = Path(os.getenv("OUTPUT_DIR", "/tmp/inference_outputs"))

    # SentinelHub credentials
    sh_client_id:      str = os.getenv("SH_CLIENT_ID", "")
    sh_client_secret:  str = os.getenv("SH_CLIENT_SECRET", "")
    sh_instance_id:    str = os.getenv("SH_INSTANCE_ID", "")

    # Inference
    device:            str = os.getenv("DEVICE", "cuda" if os.getenv("CUDA_VISIBLE_DEVICES") else "cpu")

    # Redis for Celery
    redis_url:         str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # Defaults applied when user does not override
    default_max_cloud_cover: float = 0.20
    default_resolution_m:    int   = 10
    default_crs:             str   = "EPSG:32642"

    class Config:
        env_file = ".env"


settings = Settings()

# Resolve weights directory: <project_root>/weights/
if not settings.artifacts_dir or not settings.artifacts_dir.exists():
    settings.artifacts_dir = settings.project_root / "weights"

settings.output_dir.mkdir(parents=True, exist_ok=True)


# ── Pipeline configuration ────────────────────────────────────────────────
# Derived directly from the training scripts — no pickle files needed.
#
# Segmentation (stage3_deeplabv3_colab.py):
#   Architecture:  DeepLabV3+ with SE-ResNeXt-101-32x4d encoder
#   Input:         4 bands (B02, B03, B04, B08), normalised 0-1
#   Tile size:     1024 (training), stride 512
#   Threshold:     0.3
#   Loss:          60% Dice + 40% Focal
#
# Classification (road_condition_mask.py):
#   Architecture:  EfficientNet-B2 with 4-channel input adapter
#   Patch size:    32×32
#   Classes:       3 (Good=0, Damaged=1, Unpaved=2)
#   Trained on:    K-Means clustered patches from road_condition_mask.tif
#

PIPELINE_CONFIG = {
    # ── Input ──────────────────────────────────────────────────────────────
    "required_bands":          4,           # B02, B03, B04, B08

    # ── Segmentation (P3) ─────────────────────────────────────────────────
    "seg_encoder_name":        "se_resnext101_32x4d",
    "seg_architecture":        "DeepLabV3Plus",
    "seg_patch_size":          1024,        # trained on 1024×1024 tiles
    "seg_stride":              512,         # 50% overlap for smooth stitching
    "seg_batch_size":          1,           # SE-ResNeXt-101 is large; 1 at a time
    "seg_threshold":           0.3,         # from training script THRESHOLD
    "seg_weight_file":         "road segmentation.pth",

    # ── Post-processing ───────────────────────────────────────────────────
    "morph_close_kernel_size": 5,           # 5×5 cross kernel (from Cell 11)
    "min_segment_len_m":       20.0,        # minimum road segment length (Cell 13)
    "min_polygon_area_m2":     200,         # noise filter from vectorisation

    # ── Segmenter choice (P3) ─────────────────────────────────────────────────
    # "deeplab" — DeepLabV3+ (requires seg_weight_file)
    # "osm"     — rasterise OSM road shapefile (requires osm_shp_path)
    "segmenter":               "deeplab",
    "osm_shp_path":            settings.project_root / "data" / "pak OSM masks" / "gis_osm_roads_free_1.shp",
    "osm_buffer_m":            5.0,         # buffer applied to OSM LineStrings (metres)

    # ── Classification (P4) ────────────────────────────────────────────────
    # "efficientnet" — EfficientNet-B2 per-segment patch sampling (requires clf_weight_file)
    # "kmeans"       — unsupervised K-Means on road pixels (no weights needed)
    "classifier":              "efficientnet",
    "clf_model":               "efficientnet_b2",
    "clf_patch_size":          32,          # 32×32 patches from training
    "clf_interval_m":          50,          # sample one point every 50m along road
    "clf_batch_size":          64,          # conservative for inference
    "clf_min_conf":            0.40,        # flag for review below this
    "clf_num_classes":         3,
    # Class indices match road_pipeline training (DO NOT SWAP):
    #   0 → Good (dark paved asphalt)
    #   1 → Unpaved (bright sand/dirt)
    #   2 → Damaged (vegetation-covered / degraded)
    "clf_class_names":         {0: "Good", 1: "Unpaved", 2: "Damaged"},
    "clf_weight_file":         "road_condition_model.pth",

    # ── Normalisation ──────────────────────────────────────────────────────
    "normalisation_divisor":   10000.0,     # Sentinel-2 DN → reflectance [0,1]
    "nodata_value":            -1.0,

    # ── Cloud masking ──────────────────────────────────────────────────────
    "cloud_cover_limit":       0.30,

    # ── Projection ─────────────────────────────────────────────────────────
    "target_crs":              "EPSG:32642",  # UTM Zone 42N — Sindh, Pakistan

    # ── Graph analysis (P5) ────────────────────────────────────────────────
    "condition_cost": {
        "Good":    1.0,
        "Damaged": 3.5,
        "Unpaved": 2.0,
    },
    "node_key_precision":         1,
    "isolated_threshold_nodes":   3,
}
