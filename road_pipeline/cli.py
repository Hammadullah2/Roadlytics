"""
cli.py — Command-line interface for the road segmentation + condition pipeline.

Usage (flag mode):
    python -m road_pipeline.cli \\
        --input "data/raw/sindh_stacked_clipped1.tif" \\
        --segmenter deeplab \\
        --classifier efficientnet

Usage (interactive mode — no --segmenter or --classifier supplied):
    python -m road_pipeline.cli --input "data/raw/sindh_stacked_clipped1.tif"

All flag defaults come from road_pipeline/config.py.
"""

import argparse
import sys
from pathlib import Path

from .config import (
    CLS_DIR,
    CLS_WEIGHTS,
    DEVICE,
    MIN_POLYGON_AREA_M2,
    OSM_BUFFER_M,
    RAW_DIR,
    SEG_DIR,
    SEG_THRESHOLD,
    SEG_WEIGHTS,
    SHP_DIR,
    SIMPLIFY_TOLERANCE_M,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m road_pipeline.cli",
        description="Unified road segmentation + condition classification pipeline.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "--input", "-i",
        metavar="TIF",
        help=(
            "Path to the raw 4-band Sentinel-2 GeoTIFF. "
            f"Default: data/raw/ folder in the configured DRIVE_ROOT."
        ),
    )
    parser.add_argument(
        "--segmenter", "-s",
        choices=["deeplab", "osm"],
        default=None,
        help="Segmentation method. Omit to be prompted interactively.",
    )
    parser.add_argument(
        "--classifier", "-c",
        choices=["efficientnet", "kmeans"],
        default=None,
        help="Classification method. Omit to be prompted interactively.",
    )

    # Segmentation options
    seg_group = parser.add_argument_group("DeepLabV3+ options")
    seg_group.add_argument(
        "--seg-threshold", type=float, default=SEG_THRESHOLD,
        metavar="THRESH",
        help="Sigmoid threshold for DeepLabV3+ road/non-road decision.",
    )
    seg_group.add_argument(
        "--seg-weights", type=Path, default=SEG_WEIGHTS,
        metavar="PATH",
        help="Path to the segmentation model .pth weights file.",
    )

    osm_group = parser.add_argument_group("OSM options")
    osm_group.add_argument(
        "--osm-buffer-m", type=float, default=OSM_BUFFER_M,
        metavar="METRES",
        help="Buffer radius in metres applied to OSM road LineStrings.",
    )

    # Classification options
    cls_group = parser.add_argument_group("Classification options")
    cls_group.add_argument(
        "--cls-weights", type=Path, default=CLS_WEIGHTS,
        metavar="PATH",
        help="Path to the EfficientNet-B2 classifier .pth weights file.",
    )

    # Post-processing
    post_group = parser.add_argument_group("Post-processing options")
    post_group.add_argument(
        "--emit-shapefiles", action="store_true", default=True,
        help="Vectorize class TIFs to .shp + .qml (default: enabled).",
    )
    post_group.add_argument(
        "--no-emit-shapefiles", dest="emit_shapefiles", action="store_false",
        help="Disable shapefile output.",
    )
    post_group.add_argument(
        "--min-polygon-area-m2", type=float, default=MIN_POLYGON_AREA_M2,
        metavar="M2",
        help="Minimum polygon area in m² to keep in the shapefile output.",
    )
    post_group.add_argument(
        "--simplify-tolerance-m", type=float, default=SIMPLIFY_TOLERANCE_M,
        metavar="METRES",
        help="Shapely simplification tolerance in metres.",
    )

    # Device
    parser.add_argument(
        "--device", default=DEVICE, choices=["cuda", "cpu"],
        help="Torch device.",
    )

    # Output directories (optional overrides)
    parser.add_argument("--seg-dir",  type=Path, default=None, metavar="DIR",
                        help="Override segmentation mask output directory.")
    parser.add_argument("--cls-dir",  type=Path, default=None, metavar="DIR",
                        help="Override classification mask output directory.")
    parser.add_argument("--shp-dir",  type=Path, default=None, metavar="DIR",
                        help="Override shapefile output directory.")

    return parser.parse_args()


def _prompt_segmenter() -> str:
    print("\nChoose segmentation source:")
    print("  1) DeepLabV3+ model (uses trained neural network)")
    print("  2) Pakistan OSM shapefile (uses OpenStreetMap road data)")
    while True:
        choice = input("Enter 1 or 2: ").strip()
        if choice == "1":
            return "deeplab"
        if choice == "2":
            return "osm"
        print("  Please enter 1 or 2.")


def _prompt_classifier() -> str:
    print("\nChoose classification method:")
    print("  1) EfficientNet-B2 (trained deep-learning classifier)")
    print("  2) K-Means (unsupervised spectral clustering)")
    while True:
        choice = input("Enter 1 or 2: ").strip()
        if choice == "1":
            return "efficientnet"
        if choice == "2":
            return "kmeans"
        print("  Please enter 1 or 2.")


def _resolve_input(args: argparse.Namespace) -> Path:
    if args.input:
        p = Path(args.input)
        if not p.is_absolute():
            # Try relative to cwd first, then relative to RAW_DIR
            if p.exists():
                return p.resolve()
            candidate = RAW_DIR / p
            if candidate.exists():
                return candidate
        return p  # let pipeline.run() raise FileNotFoundError with a clear message

    # Prompt interactively
    print(f"\nNo --input specified. Default raw data folder: {RAW_DIR}")
    tifs = sorted(RAW_DIR.glob("*.tif")) if RAW_DIR.exists() else []
    if tifs:
        print("Available TIF files:")
        for i, t in enumerate(tifs, 1):
            print(f"  {i}) {t.name}")
        while True:
            val = input("Enter file number or full path: ").strip()
            if val.isdigit() and 1 <= int(val) <= len(tifs):
                return tifs[int(val) - 1]
            p = Path(val)
            if p.exists():
                return p.resolve()
            print("  File not found. Try again.")
    else:
        val = input("Enter full path to input TIF: ").strip()
        return Path(val)


def main() -> None:
    args = _parse_args()

    # Resolve interactive prompts for any missing required values
    input_tif  = _resolve_input(args)
    segmenter  = args.segmenter  or _prompt_segmenter()
    classifier = args.classifier or _prompt_classifier()

    print(f"\n{'='*60}")
    print(f"Road Pipeline — starting run")
    print(f"  Input TIF   : {input_tif}")
    print(f"  Segmenter   : {segmenter}")
    print(f"  Classifier  : {classifier}")
    print(f"  Device      : {args.device}")
    print(f"  Shapefiles  : {'yes' if args.emit_shapefiles else 'no'}")
    print(f"{'='*60}")

    from .pipeline import run
    run(
        input_tif=input_tif,
        segmenter=segmenter,
        classifier=classifier,
        seg_threshold=args.seg_threshold,
        osm_buffer_m=args.osm_buffer_m,
        seg_weights=args.seg_weights,
        cls_weights=args.cls_weights,
        device=args.device,
        emit_shapefiles=args.emit_shapefiles,
        min_polygon_area_m2=args.min_polygon_area_m2,
        simplify_tolerance_m=args.simplify_tolerance_m,
        seg_dir=args.seg_dir,
        cls_dir=args.cls_dir,
        shp_dir=args.shp_dir,
    )


if __name__ == "__main__":
    main()
