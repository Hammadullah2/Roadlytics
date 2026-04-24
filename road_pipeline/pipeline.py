"""
pipeline.py - Orchestrator for the unified Roadlytics pipeline.
"""

from pathlib import Path
from typing import Dict, List, Optional

from .config import (
    ANALYTICS_DIR,
    CLASS_NAMES,
    CLS_DIR,
    CLS_WEIGHTS,
    CONNECTIVITY_DIRNAME,
    DEVICE,
    MIN_POLYGON_AREA_M2,
    OSM_BUFFER_M,
    SEG_DIR,
    SEG_THRESHOLD,
    SEG_WEIGHTS,
    SHP_DIR,
    SIMPLIFY_TOLERANCE_M,
)
from .models import PipelineDirectories, PipelineRunResult


def _human_size(path: Path) -> str:
    try:
        size = path.stat().st_size
    except FileNotFoundError:
        return "MISSING"

    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _prepare_directories(
    output_root: Optional[Path],
    seg_dir: Optional[Path],
    cls_dir: Optional[Path],
    shp_dir: Optional[Path],
    connectivity_dir: Optional[Path],
) -> PipelineDirectories:
    if output_root:
        root = Path(output_root)
        directories = PipelineDirectories(
            root=root,
            segmentation=Path(seg_dir) if seg_dir else root / "segmentation",
            classification=Path(cls_dir) if cls_dir else root / "classification",
            shapefiles=Path(shp_dir) if shp_dir else root / "shapefiles",
            connectivity=Path(connectivity_dir) if connectivity_dir else root / CONNECTIVITY_DIRNAME,
        )
    else:
        directories = PipelineDirectories(
            root=Path(output_root) if output_root else Path("."),
            segmentation=Path(seg_dir) if seg_dir else SEG_DIR,
            classification=Path(cls_dir) if cls_dir else CLS_DIR,
            shapefiles=Path(shp_dir) if shp_dir else SHP_DIR,
            connectivity=Path(connectivity_dir) if connectivity_dir else ANALYTICS_DIR,
        )

    return directories.create()


def run(
    input_tif: Path,
    segmenter: str,
    classifier: str,
    seg_threshold: float = SEG_THRESHOLD,
    osm_buffer_m: float = OSM_BUFFER_M,
    seg_weights: Path = SEG_WEIGHTS,
    cls_weights: Path = CLS_WEIGHTS,
    device: str = DEVICE,
    emit_shapefiles: bool = True,
    min_polygon_area_m2: float = MIN_POLYGON_AREA_M2,
    simplify_tolerance_m: float = SIMPLIFY_TOLERANCE_M,
    output_root: Optional[Path] = None,
    seg_dir: Optional[Path] = None,
    cls_dir: Optional[Path] = None,
    shp_dir: Optional[Path] = None,
    connectivity_dir: Optional[Path] = None,
) -> Dict[str, object]:
    """
    Run the full segmentation, classification, vectorization, and connectivity workflow.
    """
    input_tif = Path(input_tif)
    if not input_tif.exists():
        raise FileNotFoundError(f"Input TIF not found: {input_tif}")

    segmenter = segmenter.lower().strip()
    classifier = classifier.lower().strip()
    if segmenter not in ("deeplab", "osm"):
        raise ValueError(f"segmenter must be 'deeplab' or 'osm', got '{segmenter}'")
    if classifier not in ("efficientnet", "kmeans"):
        raise ValueError(f"classifier must be 'efficientnet' or 'kmeans', got '{classifier}'")

    directories = _prepare_directories(output_root, seg_dir, cls_dir, shp_dir, connectivity_dir)

    print(f"\n{'=' * 60}")
    print(f"STEP 1/4 - Segmentation [{segmenter.upper()}]")
    print(f"{'=' * 60}")
    if segmenter == "deeplab":
        from .segmentation.deeplabv3 import run as seg_run

        seg_mask_path = seg_run(
            input_tif=input_tif,
            output_dir=directories.segmentation,
            threshold=seg_threshold,
            weights_path=seg_weights,
            device=device,
        )
    else:
        from .segmentation.osm_to_mask import run as seg_run

        seg_mask_path = seg_run(
            input_tif=input_tif,
            output_dir=directories.segmentation,
            buffer_m=osm_buffer_m,
        )

    print(f"\n{'=' * 60}")
    print(f"STEP 2/4 - Classification [{classifier.upper()}]")
    print(f"{'=' * 60}")
    method_stem = f"{input_tif.stem}_{segmenter}_{classifier}"
    if classifier == "efficientnet":
        from .classification.efficientnet import run as cls_run

        cls_paths = cls_run(
            stack_path=input_tif,
            mask_path=seg_mask_path,
            stem=method_stem,
            output_dir=directories.classification,
            weights_path=cls_weights,
            device=device,
        )
    else:
        from .classification.kmeans import run as cls_run

        cls_paths = cls_run(
            stack_path=input_tif,
            mask_path=seg_mask_path,
            stem=method_stem,
            output_dir=directories.classification,
        )

    class_tifs = {name: cls_paths[i] for i, name in enumerate(CLASS_NAMES)}
    combined_tif = cls_paths[3]

    shp_paths: List[Path] = []
    if emit_shapefiles:
        print(f"\n{'=' * 60}")
        print("STEP 3/4 - Vectorization [shapefile + QML]")
        print(f"{'=' * 60}")
        from .postprocess.raster_to_vector import run as vec_run

        shp_paths = vec_run(
            class_tifs=class_tifs,
            output_dir=directories.shapefiles,
            min_area_m2=min_polygon_area_m2,
            simplify_tolerance_m=simplify_tolerance_m,
        )

    print(f"\n{'=' * 60}")
    print("STEP 4/4 - Connectivity Analytics [raster-first]")
    print(f"{'=' * 60}")
    from .analytics.connectivity import run as connectivity_run

    connectivity = connectivity_run(
        seg_mask_path=seg_mask_path,
        classified_tif_path=combined_tif,
        output_dir=directories.connectivity,
    )

    print(f"\n{'=' * 60}")
    print("PIPELINE COMPLETE - Output files")
    print(f"{'=' * 60}")

    all_files: List[Path] = [
        seg_mask_path,
        *cls_paths,
        *shp_paths,
        connectivity.component_map,
        connectivity.betweenness_map,
        connectivity.components_csv,
        connectivity.summary_json,
        connectivity.critical_junctions_geojson,
    ]
    for shp in shp_paths:
        qml = shp.with_suffix(".qml")
        if qml.exists():
            all_files.append(qml)

    col_w = max(len(path.name) for path in all_files) + 2
    print(f"{'File':<{col_w}} {'Size':>8}")
    print("-" * (col_w + 10))
    for path in all_files:
        print(f"{path.name:<{col_w}} {_human_size(path):>8}")
    print()

    result = PipelineRunResult(
        input_tif=input_tif,
        segmenter=segmenter,
        classifier=classifier,
        directories=directories,
        seg_mask=seg_mask_path,
        class_tifs=class_tifs,
        combined=combined_tif,
        shapefiles=shp_paths,
        connectivity=connectivity,
    )
    return result.to_dict()
