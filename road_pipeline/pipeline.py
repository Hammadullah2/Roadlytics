"""
pipeline.py — Orchestrator for the unified road segmentation + condition classification pipeline.

Wires together:
  segmentation  → classification → (optional) vectorization
and prints a summary table of every file produced.
"""

from pathlib import Path
from typing import Dict, List, Optional

from .config import (
    CLASS_NAMES,
    CLS_DIR,
    MIN_POLYGON_AREA_M2,
    OSM_BUFFER_M,
    RAW_DIR,
    SEG_DIR,
    SEG_THRESHOLD,
    SEG_WEIGHTS,
    CLS_WEIGHTS,
    SHP_DIR,
    SIMPLIFY_TOLERANCE_M,
    DEVICE,
)


def _human_size(path: Path) -> str:
    """Return file size as a human-readable string."""
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return "MISSING"
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def run(
    input_tif: Path,
    segmenter: str,
    classifier: str,
    # Segmentation options
    seg_threshold: float = SEG_THRESHOLD,
    osm_buffer_m: float = OSM_BUFFER_M,
    seg_weights: Path = SEG_WEIGHTS,
    cls_weights: Path = CLS_WEIGHTS,
    device: str = DEVICE,
    # Post-processing options
    emit_shapefiles: bool = True,
    min_polygon_area_m2: float = MIN_POLYGON_AREA_M2,
    simplify_tolerance_m: float = SIMPLIFY_TOLERANCE_M,
    # Output directories (None → use defaults from config)
    seg_dir: Optional[Path] = None,
    cls_dir: Optional[Path] = None,
    shp_dir: Optional[Path] = None,
) -> Dict[str, object]:
    """
    Run the full pipeline and return a dict of all produced file paths.

    Parameters
    ----------
    input_tif        : Path to the raw 4-band Sentinel-2 GeoTIFF.
    segmenter        : "deeplab" or "osm"
    classifier       : "efficientnet" or "kmeans"
    seg_threshold    : Probability threshold for DeepLabV3+ (deeplab only).
    osm_buffer_m     : Buffer radius in metres for OSM roads (osm only).
    seg_weights      : Path to the segmentation model .pth.
    cls_weights      : Path to the classification model .pth.
    device           : "cuda" or "cpu".
    emit_shapefiles  : Whether to vectorize class TIFs to .shp + .qml.
    min_polygon_area_m2 : Minimum polygon area to keep in vectorization.
    simplify_tolerance_m: Simplification tolerance for vectorization.
    seg_dir, cls_dir, shp_dir: Override default output directories.

    Returns
    -------
    dict with keys: "seg_mask", "class_tifs" (dict), "shapefiles" (list)
    """
    input_tif = Path(input_tif)
    if not input_tif.exists():
        raise FileNotFoundError(f"Input TIF not found: {input_tif}")

    segmenter  = segmenter.lower().strip()
    classifier = classifier.lower().strip()

    if segmenter not in ("deeplab", "osm"):
        raise ValueError(f"segmenter must be 'deeplab' or 'osm', got '{segmenter}'")
    if classifier not in ("efficientnet", "kmeans"):
        raise ValueError(f"classifier must be 'efficientnet' or 'kmeans', got '{classifier}'")

    # ── STEP 1: Segmentation ───────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"STEP 1/3 — Segmentation  [{segmenter.upper()}]")
    print(f"{'='*60}")

    if segmenter == "deeplab":
        from .segmentation.deeplabv3 import run as seg_run
        seg_mask_path = seg_run(
            input_tif=input_tif,
            output_dir=seg_dir,
            threshold=seg_threshold,
            weights_path=seg_weights,
            device=device,
        )
    else:  # osm
        from .segmentation.osm_to_mask import run as seg_run
        seg_mask_path = seg_run(
            input_tif=input_tif,
            output_dir=seg_dir,
            buffer_m=osm_buffer_m,
        )

    # ── STEP 2: Classification ─────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"STEP 2/3 — Classification  [{classifier.upper()}]")
    print(f"{'='*60}")

    method_stem = f"{input_tif.stem}_{segmenter}_{classifier}"

    if classifier == "efficientnet":
        from .classification.efficientnet import run as cls_run
        cls_paths = cls_run(
            stack_path=input_tif,
            mask_path=seg_mask_path,
            stem=method_stem,
            output_dir=cls_dir,
            weights_path=cls_weights,
            device=device,
        )
    else:  # kmeans
        from .classification.kmeans import run as cls_run
        cls_paths = cls_run(
            stack_path=input_tif,
            mask_path=seg_mask_path,
            stem=method_stem,
            output_dir=cls_dir,
        )

    # cls_paths = [good_tif, unpaved_tif, damaged_tif, combined_tif]
    class_tifs: Dict[str, Path] = {
        name: cls_paths[i] for i, name in enumerate(CLASS_NAMES)
    }
    combined_tif = cls_paths[3]

    # ── STEP 3: Vectorization (optional) ──────────────────────────────────────
    shp_paths: List[Path] = []
    if emit_shapefiles:
        print(f"\n{'='*60}")
        print(f"STEP 3/3 — Vectorization  [shapefile + QML]")
        print(f"{'='*60}")
        from .postprocess.raster_to_vector import run as vec_run
        shp_paths = vec_run(
            class_tifs=class_tifs,
            output_dir=shp_dir,
            min_area_m2=min_polygon_area_m2,
            simplify_tolerance_m=simplify_tolerance_m,
        )

    # ── Summary table ─────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("PIPELINE COMPLETE — Output files")
    print(f"{'='*60}")

    all_files: List[Path] = [seg_mask_path] + cls_paths + shp_paths
    # Also include .qml siblings
    for shp in shp_paths:
        qml = shp.with_suffix(".qml")
        if qml.exists() and qml not in all_files:
            all_files.append(qml)

    col_w = max(len(p.name) for p in all_files) + 2
    print(f"{'File':<{col_w}} {'Size':>8}")
    print("-" * (col_w + 10))
    for p in all_files:
        print(f"{p.name:<{col_w}} {_human_size(p):>8}")
    print()

    return {
        "seg_mask":   seg_mask_path,
        "class_tifs": class_tifs,
        "combined":   combined_tif,
        "shapefiles": shp_paths,
    }
