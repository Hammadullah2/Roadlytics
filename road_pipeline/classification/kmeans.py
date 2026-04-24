"""
classification/kmeans.py - K-Means unsupervised road condition classifier.

Features per road pixel: [blue, green, red, nir, NDVI, brightness].
Uses a deterministic relabeling rule so the output is stable across runs:
  - Highest mean brightness -> Unpaved  (raster value 2)
  - Highest mean NDVI       -> Damaged  (raster value 3)
  - Remaining cluster       -> Good     (raster value 1)
"""

from pathlib import Path
from typing import List

import numpy as np
import rasterio
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from ..config import (
    CLASS_COLORS_RGBA,
    CLASS_NAMES,
    CLASS_VALUES,
    CLS_DIR,
    RASTER_COLOR_TABLE,
    REFLECTANCE_SCALE,
)
from ..io_utils import assert_crs_32642, read_mask, write_paletted_mask


def _compute_features(stack: np.ndarray, road_y: np.ndarray, road_x: np.ndarray) -> np.ndarray:
    blue = stack[0]
    green = stack[1]
    red = stack[2]
    nir = stack[3]
    ndvi = (nir - red) / (nir + red + 1e-8)
    brightness = (blue + green + red) / 3.0

    return np.column_stack(
        [
            blue[road_y, road_x],
            green[road_y, road_x],
            red[road_y, road_x],
            nir[road_y, road_x],
            ndvi[road_y, road_x],
            brightness[road_y, road_x],
        ]
    )


def _deterministic_relabel(
    clusters: np.ndarray,
    features_unscaled: np.ndarray,
    n_clusters: int = 3,
) -> np.ndarray:
    brightness_col = 5
    ndvi_col = 4

    cluster_brightness = np.array(
        [features_unscaled[clusters == k, brightness_col].mean() for k in range(n_clusters)]
    )
    cluster_ndvi = np.array(
        [features_unscaled[clusters == k, ndvi_col].mean() for k in range(n_clusters)]
    )

    print("[K-Means] Cluster centroid diagnostics (unscaled feature space):")
    for cluster_id in range(n_clusters):
        print(
            f"  Cluster {cluster_id}: "
            f"brightness={cluster_brightness[cluster_id]:.4f} "
            f"NDVI={cluster_ndvi[cluster_id]:.4f}"
        )

    cluster_to_raster = {}
    unpaved_cluster = int(np.argmax(cluster_brightness))
    cluster_to_raster[unpaved_cluster] = CLASS_VALUES["unpaved"]

    remaining = [cluster_id for cluster_id in range(n_clusters) if cluster_id != unpaved_cluster]
    damaged_cluster = max(remaining, key=lambda cluster_id: cluster_ndvi[cluster_id])
    cluster_to_raster[damaged_cluster] = CLASS_VALUES["damaged"]

    good_cluster = [cluster_id for cluster_id in range(n_clusters) if cluster_id not in cluster_to_raster][0]
    cluster_to_raster[good_cluster] = CLASS_VALUES["good"]

    print("[K-Means] Cluster -> label mapping:")
    for cluster_id, raster_value in sorted(cluster_to_raster.items()):
        print(f"  Cluster {cluster_id} -> raster value {raster_value}")

    return np.vectorize(cluster_to_raster.get)(clusters).astype(np.uint8)


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
    """
    stack_path = Path(stack_path)
    mask_path = Path(mask_path)
    output_dir = Path(output_dir) if output_dir else CLS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    method_stem = stem or f"{stack_path.stem}_kmeans"

    print(f"[K-Means] Reading stack from {stack_path} ...")
    with rasterio.open(stack_path) as src:
        profile = src.profile.copy()
        height, width = src.height, src.width
        raw = np.clip(src.read().astype(np.float32), 0.0, 10000.0) / REFLECTANCE_SCALE

    assert_crs_32642(profile)

    mask, _ = read_mask(mask_path)
    road_y, road_x = np.where(mask == 1)
    print(f"[K-Means] Road pixels to cluster: {len(road_y):,}")

    if len(road_y) == 0:
        print("[K-Means] WARNING: No road pixels in mask. Writing empty outputs.")
        empty = np.zeros((height, width), dtype=np.uint8)
        paths = []
        for cls_name in CLASS_NAMES:
            p = output_dir / f"{method_stem}_{cls_name}.tif"
            write_paletted_mask(
                p,
                empty,
                profile,
                {
                    0: (0, 0, 0, 0),
                    1: CLASS_COLORS_RGBA[cls_name],
                },
            )
            paths.append(p)
        combined_path = output_dir / f"{method_stem}_combined.tif"
        write_paletted_mask(combined_path, empty, profile, RASTER_COLOR_TABLE)
        paths.append(combined_path)
        return paths

    features_unscaled = _compute_features(raw, road_y, road_x)
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features_unscaled)

    print(f"[K-Means] Running KMeans(n_clusters={n_clusters}, n_init={n_init}) ...")
    km = KMeans(n_clusters=n_clusters, random_state=random_state, n_init=n_init)
    clusters = km.fit_predict(features_scaled)

    raster_labels = _deterministic_relabel(clusters, features_unscaled, n_clusters)
    prediction_map = np.zeros((height, width), dtype=np.uint8)
    prediction_map[road_y, road_x] = raster_labels

    output_paths: List[Path] = []
    for cls_name in CLASS_NAMES:
        value = CLASS_VALUES[cls_name]
        binary = (prediction_map == value).astype(np.uint8)
        path = output_dir / f"{method_stem}_{cls_name}.tif"
        write_paletted_mask(
            path,
            binary,
            profile,
            {
                0: (0, 0, 0, 0),
                1: CLASS_COLORS_RGBA[cls_name],
            },
        )
        print(f"[K-Means] {cls_name}: {binary.sum():,} pixels -> {path.name}")
        output_paths.append(path)

    combined_path = output_dir / f"{method_stem}_combined.tif"
    write_paletted_mask(combined_path, prediction_map, profile, RASTER_COLOR_TABLE)
    print(f"[K-Means] Combined map -> {combined_path.name}")
    output_paths.append(combined_path)

    return output_paths
