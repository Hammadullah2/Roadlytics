"""Condition classification — P4.

Two classifier modes (set via config["classifier"]):
  "efficientnet" (default) — EfficientNet-B2 per-segment patch sampling
  "kmeans"                 — unsupervised K-Means on road pixels (no weights needed)

Both modes produce the same outputs:
  roads_classified.shp — road segments with condition/confidence attributes
  report_data.csv      — tabular summary

Handles the case where the EfficientNet model is not available:
when model is None and classifier == "efficientnet", all segments are tagged 'Unclassified'.
"""

import sys
from collections import Counter
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import torch

# road_pipeline lives at repo root (proper fyp/)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def classify(
    norm_path: Path,
    roads_shp: Path,
    output_dir: Path,
    model,                # torch.nn.Module or None
    config: dict,
    device: str,
    progress_callback=None,
    seg_path: Path = None,
) -> tuple:
    """
    Classify each road segment by condition.

    Parameters
    ----------
    norm_path   : Normalised 4-band GeoTIFF.
    roads_shp   : Vectorised road segments from the segment stage.
    output_dir  : Job directory for outputs.
    model       : EfficientNet-B2 module, or None.
    config      : PIPELINE_CONFIG dict.
    device      : "cuda" or "cpu".
    progress_callback : Optional callable(pct, message).
    seg_path    : Binary road-mask TIF — required when classifier=="kmeans".

    Returns
    -------
    (roads_classified.shp path, report_data.csv path)
    """
    classifier = config.get("classifier", "efficientnet")

    if classifier == "kmeans":
        if seg_path is None:
            raise ValueError(
                "seg_path must be supplied to classify() when classifier='kmeans'."
            )
        return _classify_kmeans(
            norm_path, roads_shp, seg_path, output_dir, config, progress_callback
        )
    else:
        return _classify_efficientnet(
            norm_path, roads_shp, output_dir, model, config, device, progress_callback
        )


# ── EfficientNet branch ───────────────────────────────────────────────────────

def _classify_efficientnet(norm_path, roads_shp, output_dir, model, config, device,
                            progress_callback):
    CLASS_NAMES = config["clf_class_names"]
    ps          = config["clf_patch_size"]
    half        = ps // 2
    interval    = config["clf_interval_m"]
    bs          = config["clf_batch_size"]
    nodata      = config["nodata_value"]

    roads = gpd.read_file(roads_shp).to_crs(config["target_crs"])
    total = len(roads)
    seg_results = {}

    if model is None:
        for idx, row in roads.iterrows():
            seg_results[row["road_id"]] = {
                "condition":  "Unclassified",
                "confidence": 0.0,
                "prob_good":  0.0,
                "prob_dam":   0.0,
                "prob_unp":   0.0,
            }
        if progress_callback:
            progress_callback(100, "Classifier not loaded — all segments marked Unclassified")
    else:
        with rasterio.open(norm_path) as src:
            inv_tf = ~src.transform

            for idx, row in roads.iterrows():
                sid  = row["road_id"]
                geom = row.geometry

                n_pts = max(1, int(geom.length / interval))
                patches = []
                for i in range(n_pts):
                    pt  = geom.interpolate(i / max(n_pts - 1, 1), normalized=True)
                    cf, rf = inv_tf * (pt.x, pt.y)
                    c, r = int(cf), int(rf)
                    if (r - half < 0 or r + half >= src.height or
                            c - half < 0 or c + half >= src.width):
                        continue
                    window = rasterio.windows.Window(c - half, r - half, ps, ps)
                    patch  = src.read(window=window).astype(np.float32)
                    patch  = np.where(patch == nodata, 0.0, patch)
                    if patch.shape == (config["required_bands"], ps, ps):
                        patches.append(patch)

                if not patches:
                    seg_results[sid] = {
                        "condition":  "Unpaved",
                        "confidence": 0.33,
                        "prob_good":  0.33, "prob_dam": 0.33, "prob_unp": 0.34,
                    }
                    continue

                all_probs = []
                for b in range(0, len(patches), bs):
                    batch  = np.stack(patches[b:b + bs])
                    tensor = torch.tensor(batch, dtype=torch.float32).to(device)
                    with torch.no_grad():
                        logits = model(tensor)
                        probs  = torch.softmax(logits, dim=1).cpu().numpy()
                    all_probs.append(probs)

                avg  = np.concatenate(all_probs, axis=0).mean(axis=0)
                pred = int(avg.argmax())
                seg_results[sid] = {
                    "condition":  CLASS_NAMES[pred],
                    "confidence": float(avg.max()),
                    "prob_good":  float(avg[0]),
                    "prob_dam":   float(avg[1]),
                    "prob_unp":   float(avg[2]),
                }

                if progress_callback and idx % max(1, total // 20) == 0:
                    pct = int((idx + 1) / total * 100)
                    progress_callback(pct, f"Classifying segment {idx+1}/{total}")

    return _write_results(roads, seg_results, output_dir, config)


# ── K-Means branch ────────────────────────────────────────────────────────────

def _classify_kmeans(norm_path, roads_shp, seg_path, output_dir, config, progress_callback):
    """
    Use road_pipeline's K-Means classifier to assign conditions per road segment.

    Steps:
    1. Build a per-pixel prediction_map using road_pipeline's K-Means logic.
    2. For each road segment, sample the prediction_map at interpolated points.
    3. Assign the majority-vote condition to the segment.
    """
    from road_pipeline.classification.kmeans import (
        _compute_features,
        _deterministic_relabel,
    )
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    # Raster value → condition name (matches road_pipeline CLASS_VALUES)
    _RASTER_TO_CONDITION = {1: "Good", 2: "Unpaved", 3: "Damaged"}

    if progress_callback:
        progress_callback(5, "K-Means: loading raster data")

    with rasterio.open(norm_path) as src:
        raw       = src.read().astype(np.float32)
        transform = src.transform
        H, W      = src.height, src.width

    with rasterio.open(seg_path) as src:
        mask_arr = src.read(1)

    road_y, road_x = np.where(mask_arr == 1)
    n_road = len(road_y)

    if n_road == 0:
        roads = gpd.read_file(roads_shp).to_crs(config["target_crs"])
        seg_results = {
            row["road_id"]: {"condition": "Unpaved", "confidence": 0.0,
                             "prob_good": 0.0, "prob_dam": 0.0, "prob_unp": 1.0}
            for _, row in roads.iterrows()
        }
        if progress_callback:
            progress_callback(100, "K-Means: no road pixels found")
        return _write_results(roads, seg_results, output_dir, config)

    if progress_callback:
        progress_callback(15, f"K-Means: clustering {n_road:,} road pixels")

    features_unscaled = _compute_features(raw, road_y, road_x)
    features_scaled   = StandardScaler().fit_transform(features_unscaled)
    km       = KMeans(n_clusters=3, random_state=42, n_init=10)
    clusters = km.fit_predict(features_scaled)
    raster_labels = _deterministic_relabel(clusters, features_unscaled, n_clusters=3)

    prediction_map = np.zeros((H, W), dtype=np.uint8)
    prediction_map[road_y, road_x] = raster_labels

    if progress_callback:
        progress_callback(60, "K-Means: assigning conditions to road segments")

    roads    = gpd.read_file(roads_shp).to_crs(config["target_crs"])
    inv_tf   = ~transform
    interval = config["clf_interval_m"]
    seg_results = {}

    for idx, row in roads.iterrows():
        sid  = row["road_id"]
        geom = row.geometry
        n_pts = max(1, int(geom.length / interval))

        pixel_labels = []
        for i in range(n_pts):
            pt     = geom.interpolate(i / max(n_pts - 1, 1), normalized=True)
            cf, rf = inv_tf * (pt.x, pt.y)
            c, r   = int(cf), int(rf)
            if 0 <= r < H and 0 <= c < W:
                val = int(prediction_map[r, c])
                if val > 0:
                    pixel_labels.append(val)

        if pixel_labels:
            cnt       = Counter(pixel_labels)
            majority  = cnt.most_common(1)[0][0]
            confidence = cnt[majority] / len(pixel_labels)
            condition  = _RASTER_TO_CONDITION.get(majority, "Unpaved")
            counts     = {v: cnt.get(k, 0) / len(pixel_labels)
                          for k, v in _RASTER_TO_CONDITION.items()}
        else:
            condition, confidence = "Unpaved", 0.33
            counts = {"Good": 0.33, "Unpaved": 0.34, "Damaged": 0.33}

        seg_results[sid] = {
            "condition":  condition,
            "confidence": round(confidence, 4),
            "prob_good":  round(counts.get("Good",    0.0), 4),
            "prob_unp":   round(counts.get("Unpaved", 0.0), 4),
            "prob_dam":   round(counts.get("Damaged", 0.0), 4),
        }

        if progress_callback and idx % max(1, len(roads) // 20) == 0:
            pct = 60 + int((idx + 1) / len(roads) * 35)
            progress_callback(pct, f"K-Means: segment {idx+1}/{len(roads)}")

    if progress_callback:
        progress_callback(100, "K-Means classification complete")

    return _write_results(roads, seg_results, output_dir, config)


# ── Shared writer ─────────────────────────────────────────────────────────────

def _write_results(roads: gpd.GeoDataFrame, seg_results: dict,
                   output_dir: Path, config: dict) -> tuple:
    for field in ["condition", "confidence", "prob_good", "prob_dam", "prob_unp"]:
        roads[field] = roads["road_id"].map(
            lambda s, f=field: seg_results.get(s, {}).get(f)
        )

    roads["review"] = roads["confidence"] < config["clf_min_conf"]

    clf_shp = output_dir / "roads_classified.shp"
    roads.to_file(clf_shp, driver="ESRI Shapefile")

    csv_cols = ["road_id", "condition", "confidence",
                "prob_good", "prob_dam", "prob_unp", "length_m", "review"]
    roads["geom_wkt"] = roads.geometry.to_wkt()
    clf_csv = output_dir / "report_data.csv"
    roads[csv_cols + ["geom_wkt"]].to_csv(clf_csv, index=False)

    return clf_shp, clf_csv
