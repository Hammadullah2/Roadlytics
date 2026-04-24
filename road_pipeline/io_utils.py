"""
io_utils.py - Thin rasterio read/write helpers shared across all pipeline stages.
"""

from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import rasterio

from .config import REFLECTANCE_SCALE


def read_stack(path: Path) -> Tuple[np.ndarray, dict]:
    """
    Open a 4-band Sentinel-2 GeoTIFF and return a float32 array in [0, 1].
    """
    path = Path(path)
    with rasterio.open(path) as src:
        raw = src.read().astype(np.float32)
        profile = src.profile.copy()

    stack = np.clip(raw, 0.0, 10000.0) / REFLECTANCE_SCALE
    return stack, profile


def read_mask(path: Path) -> Tuple[np.ndarray, dict]:
    """
    Open a single-band uint8 mask GeoTIFF.
    """
    path = Path(path)
    with rasterio.open(path) as src:
        mask = src.read(1).astype(np.uint8)
        profile = src.profile.copy()
    return mask, profile


def _prepare_output_profile(profile: dict, dtype: str, count: int = 1, nodata=0) -> dict:
    out_profile = profile.copy()
    out_profile.update(
        dtype=dtype,
        count=count,
        nodata=nodata,
        compress="lzw",
        tiled=True,
    )
    out_profile.pop("blockxsize", None)
    out_profile.pop("blockysize", None)
    return out_profile


def write_binary_mask(path: Path, mask: np.ndarray, profile: dict) -> None:
    """
    Write a single-band binary uint8 mask to a GeoTIFF with LZW compression.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    out_profile = _prepare_output_profile(profile, dtype="uint8")
    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(mask.astype(np.uint8), 1)


def write_paletted_mask(
    path: Path,
    mask: np.ndarray,
    profile: dict,
    color_table: Dict[int, Tuple[int, int, int, int]],
) -> None:
    """
    Write a single-band uint8 mask with an embedded color table.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    out_profile = _prepare_output_profile(profile, dtype="uint8")
    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(mask.astype(np.uint8), 1)
        dst.write_colormap(1, color_table)


def write_labeled_raster(path: Path, data: np.ndarray, profile: dict) -> None:
    """
    Write a uint16 labeled raster such as component IDs.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    out_profile = _prepare_output_profile(profile, dtype="uint16", nodata=0)
    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(data.astype(np.uint16), 1)


def write_float_raster(path: Path, data: np.ndarray, profile: dict, nodata: float = -1.0) -> None:
    """
    Write a float32 raster such as centrality scores.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    out_profile = _prepare_output_profile(profile, dtype="float32", nodata=nodata)
    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(data.astype(np.float32), 1)


def assert_crs_32642(profile: dict) -> None:
    """
    Warn (not raise) if the input raster is not in EPSG:32642.
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
            f"[WARNING] Input raster CRS is EPSG:{epsg}, expected EPSG:32642. "
            "Outputs will inherit the input CRS. Reproject the input TIF to "
            "EPSG:32642 if spatial accuracy matters."
        )
