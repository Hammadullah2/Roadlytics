"""
classification/kmeans.py — K-Means unsupervised road condition classifier.

Features per road pixel: [blue, green, red, nir, NDVI, brightness].
Uses a centroid-based deterministic relabeling rule so the output is stable
across different images and runs:
  - Highest mean brightness → Unpaved  (raster value 2)
  - Highest mean NDVI       → Damaged  (raster value 3)
  - Remaining cluster       → Good     (raster value 1)

This matches the "corrected mapping" comment in the original road_condition_mask.py.
"""

from pathlib import Path
from typing import List

import numpy as np
import rasterio
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

from ..config import (
    CLASS_NAMES,
    CLASS_VALUES,
    CLS_DIR,
    REFLECTANCE_SCALE,
)
from ..io_utils import assert_crs_32642, read_mask, write_binary_mask


def _compute_features(stack: np.ndarray, road_y: np.ndarray, road_x: np.ndarray) -> np.ndarray:
    """
    Extract [blue, green, red, nir, NDVI, brightness] for each road pixel.

    Parameters
    ----------
    stack  : (4, H, W) float32 array in [0, 1]  (B, G, R, NIR)
    road_y : row indices of road pixels
    road_x : col indices of road pixels

    Returns
    -------
    features : (N, 6) float32 array (unscaled, original units)
    """
    blue       = stack[0]
    green      = stack[1]
    red        = stack[2]
    nir        = stack[3]
    ndvi       = (nir - red) / (nir + red + 1e-8)
    brightness = (blue + green + red) / 3.0

    features = np.column_stack([
        blue[road_y, road_x],
        green[road_y, road_x],
        red[road_y, road_x],
        nir[road_y, road_x],
        ndvi[road_y, road_x],
        brightness[road_y, road_x],
    ])
    return features   # (N, 6)


def _deterministic_relabel(
    clusters: np.ndarray,
    features_unscaled: np.ndarray,
    n_clusters: int = 3,
) -> np.ndarray:
    """
    Map arbitrary KMeans cluster IDs to raster values {1, 2, 3} using centroid rules.

    Rules (applied in priority order):
      1. Cluster with highest mean brightness → Unpaved (value 2)
      2. Cluster with highest mean NDVI       → Damaged (value 3)
      3. Remaining cluster                    → Good    (value 1)

    Returns
    -------
    relabeled : (N,) uint8 array of raster values {1, 2, 3}
    """
    # Compute per-cluster means for brightness (col 5) and NDVI (col 4)
    brightness_col = 5
    ndvi_col       = 4

    cluster_brightness = np.array([
        features_unscaled[clusters == k, brightness_col].mean()
        for k in range(n_clusters)
    ])
    cluster_ndvi = np.array([
        features_unscaled[clusters == k, ndvi_col].mean()
        for k in range(n_clusters)
    ])

    print("[K-Means] Cluster centroid diagnostics (unscaled feature space):")
    for k in range(n_clusters):
        print(f"  Cluster {k}: brightness={cluster_brightness[k]:.4f}  NDVI={cluster_ndvi[k]:.4f}")

    # Mapping: cluster_id → raster_value
    cluster_to_raster = {}

    # Priority 1: unpaved = highest brightness
    unpaved_cluster = int(np.argmax(cluster_brightness))
    cluster_to_raster[unpaved_cluster] = CLASS_VALUES["unpaved"]   # 2

    # Priority 2: damaged = highest NDVI (excluding already-assigned cluster)
    remaining = [k for k in range(n_clusters) if k != unpaved_cluster]
    ndvi_remaining = {k: cluster_ndvi[k] for k in remaining}
    damaged_cluster = max(ndvi_remaining, key=lambda k: ndvi_remaining[k])
    cluster_to_raster[damaged_cluster] = CLASS_VALUES["damaged"]   # 3

    # Priority 3: good = what's left
    good_cluster = [k for k in range(n_clusters) if k not in cluster_to_raster][0]
    cluster_to_raster[good_cluster] = CLASS_VALUES["good"]         # 1

    label_names = {v: k for k, v in CLASS_VALUES.items()}
    print("[K-Means] Cluster → label mapping:")
    for k, v in sorted(cluster_to_raster.items()):
        print(f"  Cluster {k} → {label_names[v]} (raster value {v})")

    relabeled = np.vectorize(cluster_to_raster.get)(clusters).astype(np.uint8)
    return relabeled


def run(
    stack_path: Path,
    mask_path: Path,
    stem: str = None,
    output_dir: Path = None,
    n_clusters: int = 3,
    random_state: int = 42,
    n_init: int = 10,
) -> List[Path]:
    """
    Run K-Means condition classification and write binary class TIFs.

    Parameters
    ----------
    stack_path   : Path to the raw 4-band Sentinel-2 GeoTIFF.
    mask_path    : Path to the binary road-mask TIF.
    stem         : Output filename stem (default: derived from stack_path + method).
    output_dir   : Folder for output TIFs (default: CLS_DIR from config).
    n_clusters   : Number of K-Means clusters (default 3).
    random_state : RNG seed for reproducibility (default 42).
    n_init       : Number of K-Means initializations (default 10).

    Returns
    -------
    List of Paths: [good_tif, unpaved_tif, damaged_tif, combined_tif]
    """
    stack_path = Path(stack_path)
    mask_path  = Path(mask_path)
    output_dir = Path(output_dir) if output_dir else CLS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    method_stem = stem or f"{stack_path.stem}_kmeans"

    # ── Load stack ────────────────────────────────────────────────────────────
    print(f"[K-Means] Reading stack from {stack_path} …")
    with rasterio.open(stack_path) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        raw = np.clip(src.read().astype(np.float32), 0.0, 10000.0) / REFLECTANCE_SCALE

    assert_crs_32642(profile)

    # ── Load road mask ────────────────────────────────────────────────────────
    mask, _ = read_mask(mask_path)
    road_y, road_x = np.where(mask == 1)
    print(f"[K-Means] Road pixels to cluster: {len(road_y):,}")

    if len(road_y) == 0:
        print("[K-Means] WARNING: No road pixels in mask. Writing empty outputs.")
        empty = np.zeros((H, W), dtype=np.uint8)
        paths = []
        for cls_name in CLASS_NAMES:
            p = output_dir / f"{method_stem}_{cls_name}.tif"
            write_binary_mask(p, empty, profile)
            paths.append(p)
        combined_path = output_dir / f"{method_stem}_combined.tif"
        write_binary_mask(combined_path, empty, profile)
        paths.append(combined_path)
        return paths

    # ── Extract features (unscaled) ───────────────────────────────────────────
    features_unscaled = _compute_features(raw, road_y, road_x)   # (N, 6)

    # ── Scale and cluster ─────────────────────────────────────────────────────
    scaler           = StandardScaler()
    features_scaled  = scaler.fit_transform(features_unscaled)

    print(f"[K-Means] Running KMeans(n_clusters={n_clusters}, n_init={n_init}) …")
    km = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=n_init)
    clusters = km.fit_predict(features_scaled)   # (N,) with values 0, 1, 2

    # ── Deterministic relabeling ──────────────────────────────────────────────
    raster_labels = _deterministic_relabel(clusters, features_unscaled, n_clusters)

    # ── Build prediction map ──────────────────────────────────────────────────
    prediction_map = np.zeros((H, W), dtype=np.uint8)
    prediction_map[road_y, road_x] = raster_labels

    # ── Split into binary TIFs + combined TIF ─────────────────────────────────
    output_paths: List[Path] = []
    for cls_name in CLASS_NAMES:
        val    = CLASS_VALUES[cls_name]
        binary = (prediction_map == val).astype(np.uint8)
        p      = output_dir / f"{method_stem}_{cls_name}.tif"
        write_binary_mask(p, binary, profile)
        print(f"[K-Means] {cls_name}: {binary.sum():,} pixels → {p.name}")
        output_paths.append(p)

    combined_path = output_dir / f"{method_stem}_combined.tif"
    write_binary_mask(combined_path, prediction_map, profile)
    print(f"[K-Means] Combined map → {combined_path.name}")
    output_paths.append(combined_path)

    return output_paths
