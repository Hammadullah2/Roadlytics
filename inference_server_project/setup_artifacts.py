"""
Setup script to prepare the artifacts (weights) directory for the inference server.

Usage:
    python setup_artifacts.py

This script verifies that the required weight files are in place
and reports which pipeline stages are ready to run.
"""

from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parent.parent  # → proper fyp/
WEIGHTS_DIR  = PROJECT_ROOT / "weights"

REQUIRED_FILES = {
    "road segmentation.pth": {
        "stage":    "P3 — Road Segmentation (DeepLabV3+ SE-ResNeXt-101)",
        "required": True,
    },
    "road_condition_model.pth": {
        "stage":    "P4 — Road Condition Classification (EfficientNet-B2)",
        "required": False,   # pipeline can run without this
    },
}


def main():
    print("=" * 60)
    print("  Inference Server — Artifact Setup Check")
    print("=" * 60)
    print(f"\nWeights directory: {WEIGHTS_DIR}")
    print()

    if not WEIGHTS_DIR.exists():
        print(f"ERROR: Weights directory not found at {WEIGHTS_DIR}")
        print(f"Create it and place your .pth files there.")
        sys.exit(1)

    all_ok = True
    for filename, info in REQUIRED_FILES.items():
        path = WEIGHTS_DIR / filename
        if path.exists():
            size_mb = path.stat().st_size / (1024 * 1024)
            print(f"  [OK]      {filename:<35} {size_mb:>8.1f} MB   [{info['stage']}]")
        else:
            marker = "[MISSING]  (REQUIRED)" if info["required"] else "[WARN]     (optional)"
            print(f"  {marker}  {filename:<35}  [{info['stage']}]")
            if info["required"]:
                all_ok = False

    print()
    if all_ok:
        print("All required weights are in place. Server is ready to start.")
    else:
        print("Some required weights are missing. The server will fail to start.")
        print(f"Place the missing .pth files in: {WEIGHTS_DIR}/")

    print()
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
