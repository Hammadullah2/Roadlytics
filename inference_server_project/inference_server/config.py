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

    # ── Supabase bridge (VPS → Supabase) ─────────────────────────────────────
    # The inference server writes progress and uploads outputs directly to Supabase
    # using the service-role key so it can bypass Row-Level Security.
    supabase_url:               str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key:  str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # Bucket where all inference output files are stored (PDFs, GeoJSON, GraphML …).
    # Create this bucket in the Supabase dashboard: Storage → New bucket.
    storage_bucket_outputs:     str = os.getenv("STORAGE_BUCKET_OUTPUTS", "inference-outputs")

    # ── Backend callback (VPS → Vercel) ──────────────────────────────────────
    # The inference server POSTs signed notifications to the deployed backend
    # so any server-side post-processing (e.g. inserting report rows) can run.
    backend_callback_url:   str = os.getenv("BACKEND_CALLBACK_URL", "")
    internal_secret:        str = os.getenv("INTERNAL_SECRET", "")

    # ── S3-compatible output storage (R2, AWS S3, MinIO, etc.) ───────────────
    # Use this instead of Supabase Storage to handle output files larger than
    # Supabase's 50 MB free-tier limit (segmentation TIFs can exceed 300 MB).
    #
    # Cloudflare R2 (recommended — zero egress fees):
    #   S3_ENDPOINT_URL  = https://<account_id>.r2.cloudflarestorage.com
    #   S3_PUBLIC_BASE_URL = https://pub-<token>.r2.dev   (enable in R2 dashboard)
    #
    # AWS S3:
    #   S3_ENDPOINT_URL  = (leave blank — boto3 uses AWS regional endpoints)
    #   S3_PUBLIC_BASE_URL = https://<bucket>.s3.<region>.amazonaws.com
    s3_endpoint_url:       str = os.getenv("S3_ENDPOINT_URL", "")
    s3_access_key_id:      str = os.getenv("S3_ACCESS_KEY_ID", "")
    s3_secret_access_key:  str = os.getenv("S3_SECRET_ACCESS_KEY", "")
    s3_bucket_name:        str = os.getenv("S3_BUCKET_NAME", "roadlytics-outputs")
    s3_public_base_url:    str = os.getenv("S3_PUBLIC_BASE_URL", "")

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
