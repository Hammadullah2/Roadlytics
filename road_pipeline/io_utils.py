"""
io_utils.py — Thin rasterio read/write helpers shared across all pipeline stages.
"""

from pathlib import Path
from typing import Tuple

import numpy as np
import rasterio
from rasterio.enums import Resampling

from .config import REFLECTANCE_SCALE


# ── Read helpers ───────────────────────────────────────────────────────────────

def read_stack(path: Path) -> Tuple[np.ndarray, dict]:
    """
    Open a 4-band Sentinel-2 GeoTIFF and return a float32 array in [0, 1].

    Returns
    -------
    stack   : np.ndarray, shape (4, H, W), dtype float32, values in [0, 1]
    profile : rasterio profile dict (copy)
    """
    path = Path(path)
    with rasterio.open(path) as src:
        raw = src.read().astype(np.float32)          # (4, H, W)
        profile = src.profile.copy()

    stack = np.clip(raw, 0.0, 10000.0) / REFLECTANCE_SCALE
    return stack, profile


def read_mask(path: Path) -> Tuple[np.ndarray, dict]:
    """
    Open a single-band uint8 binary mask GeoTIFF.

    Returns
    -------
    mask    : np.ndarray, shape (H, W), dtype uint8
    profile : rasterio profile dict (copy)
    """
    path = Path(path)
    with rasterio.open(path) as src:
        mask = src.read(1).astype(np.uint8)
        profile = src.profile.copy()
    return mask, profile


# ── Write helpers ──────────────────────────────────────────────────────────────

def write_binary_mask(path: Path, mask: np.ndarray, profile: dict) -> None:
    """
    Write a single-band binary uint8 mask to a GeoTIFF with LZW compression.

    Parameters
    ----------
    path    : output file path
    mask    : np.ndarray, shape (H, W), dtype convertible to uint8
    profile : rasterio profile to base the output on (will be updated in-place copy)
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    out_profile = profile.copy()
    out_profile.update(
        dtype="uint8",
        count=1,
        nodata=0,
        compress="lzw",
    )
    # Remove keys that rasterio might not accept on write
    out_profile.pop("tiled", None)

    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(mask.astype(np.uint8), 1)


# ── CRS guard ─────────────────────────────────────────────────────────────────

def assert_crs_32642(profile: dict) -> None:
    """
    Warn (not raise) if the input raster is not in EPSG:32642.
    We warn rather than raise so that users can still run the pipeline on
    reprojected data without any code changes.
    """
    crs = profile.get("crs")
    if crs is None:
        print("[WARNING] Input raster has no CRS defined.")
        return

    try:
        epsg = crs.to_epsg()
    except Exception:
        epsg = None

    if epsg != 32642:
        print(
            f"[WARNING] Input raster CRS is EPSG:{epsg}, expected EPSG:32642 (UTM 42N / Sindh). "
            "Outputs will inherit the input CRS. If spatial accuracy matters, "
            "reproject the input TIF to EPSG:32642 first."
        )
