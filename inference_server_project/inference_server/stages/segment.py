"""Road segmentation — P3.

Two segmenter modes (set via config["segmenter"]):
  "deeplab" (default) — DeepLabV3+ sliding-window inference (matches stage3_deeplabv3_colab.py)
  "osm"               — rasterise Pakistan OSM road shapefile via road_pipeline (no model needed)

Both modes produce the same outputs:
  seg_mask.tif   — binary uint8 road mask
  roads_raw.shp  — vectorised road polylines
"""

import sys
from pathlib import Path

import cv2
import numpy as np
import rasterio
import torch

# road_pipeline lives at the repo root (proper fyp/)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def segment(
    norm_path: Path,
    output_dir: Path,
    model: torch.nn.Module,
    config: dict,
    device: str,
    progress_callback=None,
    raw_tif_path: Path = None,
) -> Path:
    """
    Run segmentation and vectorise to polylines.

    Parameters
    ----------
    norm_path     : Normalised 4-band GeoTIFF (output of preprocess stage).
    output_dir    : Job directory for all outputs.
    model         : Loaded DeepLabV3+ module (ignored when segmenter=="osm").
    config        : PIPELINE_CONFIG dict.
    device        : "cuda" or "cpu".
    progress_callback : Optional callable(pct, message).
    raw_tif_path  : Original (unnormalised) TIF — only needed when segmenter=="osm".
                    Falls back to norm_path when not supplied.

    Returns
    -------
    seg_mask.tif path
    """
    segmenter = config.get("segmenter", "deeplab")

    if segmenter == "osm":
        return _segment_osm(
            norm_path, output_dir, config, progress_callback,
            raw_tif_path or norm_path,
        )
    else:
        return _segment_deeplab(norm_path, output_dir, model, config, device, progress_callback)


# ── DeepLabV3+ branch ─────────────────────────────────────────────────────────

def _segment_deeplab(norm_path, output_dir, model, config, device, progress_callback):
    """Sliding-window DeepLabV3+ inference + vectorisation."""
    ps        = config["seg_patch_size"]
    st        = config["seg_stride"]
    bs        = config["seg_batch_size"]
    thr       = config["seg_threshold"]
    nodata_in = config["nodata_value"]

    with rasterio.open(norm_path) as src:
        image   = src.read().astype(np.float32)
        profile = src.profile.copy()
        H, W    = image.shape[1], image.shape[2]

    prob_sum  = np.zeros((H, W), dtype=np.float32)
    count_map = np.zeros((H, W), dtype=np.float32)

    coords = [(r, c)
              for r in range(0, max(H - ps + 1, 1), st)
              for c in range(0, max(W - ps + 1, 1), st)]

    total_batches = max(1, len(coords) // bs + 1)
    for batch_idx, b_start in enumerate(range(0, len(coords), bs)):
        batch_coords = coords[b_start:b_start + bs]
        patches = []
        for (r, c) in batch_coords:
            p = image[:, r:r+ps, c:c+ps]
            p = np.where(p == nodata_in, 0.0, p)
            if p.shape[1] != ps or p.shape[2] != ps:
                p = np.pad(
                    p,
                    ((0, 0), (0, ps - p.shape[1]), (0, ps - p.shape[2])),
                    constant_values=0,
                )
            patches.append(p)

        tensor = torch.tensor(np.stack(patches), dtype=torch.float32).to(device)
        with torch.no_grad():
            logits = model(tensor)
            probs  = torch.sigmoid(logits).squeeze(1).cpu().numpy()

        for i, (r, c) in enumerate(batch_coords):
            hh = min(ps, H - r)
            ww = min(ps, W - c)
            prob_sum[r:r+hh, c:c+ww]  += probs[i, :hh, :ww]
            count_map[r:r+hh, c:c+ww] += 1.0

        if progress_callback:
            pct = int((batch_idx + 1) / total_batches * 80)
            progress_callback(pct, f"Segmentation: {batch_idx+1}/{total_batches} batches")

    count_map = np.where(count_map == 0, 1, count_map)
    binary    = (prob_sum / count_map > thr).astype(np.uint8)

    ks = config["morph_close_kernel_size"]
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (ks, ks))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    if progress_callback:
        progress_callback(85, "Morphological closing applied")

    seg_path = _write_seg_mask(binary, profile, output_dir)

    if progress_callback:
        progress_callback(100, f"Segmentation complete")

    return seg_path


# ── OSM branch ────────────────────────────────────────────────────────────────

def _segment_osm(norm_path, output_dir, config, progress_callback, ref_tif_path):
    """
    Rasterise Pakistan OSM road network using road_pipeline.segmentation.osm_to_mask.

    Requires config["osm_shp_path"] to point to gis_osm_roads_free_1.shp.
    """
    from road_pipeline.segmentation.osm_to_mask import run as osm_run

    osm_shp = config.get("osm_shp_path")
    if osm_shp is None:
        raise ValueError(
            "config['osm_shp_path'] must be set when using segmenter='osm'. "
            "Provide the path to gis_osm_roads_free_1.shp."
        )

    if progress_callback:
        progress_callback(10, "Rasterising OSM road shapefile")

    osm_mask_path = osm_run(
        input_tif  = ref_tif_path,
        output_dir = output_dir,
        osm_shp    = Path(osm_shp),
        buffer_m   = config.get("osm_buffer_m", 5.0),
    )

    # Read the OSM mask and write it as seg_mask.tif in the job directory
    with rasterio.open(osm_mask_path) as src:
        binary  = src.read(1)
        profile = src.profile.copy()

    seg_path = output_dir / "seg_mask.tif"
    if osm_mask_path != seg_path:
        profile.update({"compress": "lzw"})
        with rasterio.open(seg_path, "w", **profile) as dst:
            dst.write(binary, 1)

    if progress_callback:
        progress_callback(100, "OSM segmentation complete")

    return seg_path


# ── Shared helpers ────────────────────────────────────────────────────────────

def _write_seg_mask(binary: np.ndarray, profile: dict, output_dir: Path) -> Path:
    seg_path = output_dir / "seg_mask.tif"
    profile.update({"dtype": "uint8", "count": 1, "nodata": 255, "compress": "lzw"})
    with rasterio.open(seg_path, "w", **profile) as dst:
        dst.write(binary, 1)
    return seg_path
