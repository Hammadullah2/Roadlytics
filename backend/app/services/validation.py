"""Validation, raster packaging, and small geospatial utilities."""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path
from typing import Dict, Iterable, Sequence

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.shutil import copy as rio_copy


def validate_sentinel_l2(path: Path) -> Dict[str, object]:
    path = Path(path)
    with rasterio.open(path) as src:
        if src.count != 4:
            raise ValueError("Sentinel upload must be a 4-band GeoTIFF in B2, B3, B4, B8 order.")
        if src.crs is None:
            raise ValueError("Uploaded GeoTIFF must include a coordinate reference system.")
        if src.transform.is_identity:
            raise ValueError("Uploaded GeoTIFF must include georeferencing information.")

        bounds = [float(src.bounds.left), float(src.bounds.bottom), float(src.bounds.right), float(src.bounds.top)]
        return {
            "filename": path.name,
            "width": int(src.width),
            "height": int(src.height),
            "band_count": int(src.count),
            "dtype": src.dtypes[0],
            "crs": str(src.crs),
            "bounds": bounds,
        }


def extract_raster_metadata(path: Path) -> Dict[str, object]:
    with rasterio.open(path) as src:
        return {
            "width": int(src.width),
            "height": int(src.height),
            "band_count": int(src.count),
            "dtype": src.dtypes[0],
            "crs": str(src.crs) if src.crs else None,
            "bounds": [
                float(src.bounds.left),
                float(src.bounds.bottom),
                float(src.bounds.right),
                float(src.bounds.top),
            ],
        }


def build_sentinel_rgb(source_path: Path, output_path: Path) -> Path:
    source_path = Path(source_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with rasterio.open(source_path) as src:
        rgb = src.read([3, 2, 1]).astype(np.float32)
        rendered = np.zeros_like(rgb, dtype=np.uint8)
        for index in range(3):
            band = rgb[index]
            valid = band[np.isfinite(band) & (band > 0)]
            if valid.size == 0:
                continue
            low = float(np.percentile(valid, 2))
            high = float(np.percentile(valid, 98))
            if high <= low:
                scaled = np.clip(band / max(high, 1.0), 0.0, 1.0)
            else:
                scaled = np.clip((band - low) / (high - low), 0.0, 1.0)
            rendered[index] = (scaled * 255).astype(np.uint8)

        profile = src.profile.copy()
        profile.update(
            driver="GTiff",
            count=3,
            dtype="uint8",
            photometric="RGB",
            compress="DEFLATE",
        )

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(rendered)
    return output_path


def write_cog_or_copy(source_path: Path, output_path: Path) -> Path:
    source_path = Path(source_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with rasterio.open(source_path) as src:
            resampling = Resampling.average if src.count > 1 else Resampling.nearest
        rio_copy(
            source_path,
            output_path,
            driver="COG",
            compress="DEFLATE",
            overview_resampling=resampling.name,
        )
    except Exception:
        shutil.copy2(source_path, output_path)
    return output_path


def package_shapefiles(shapefile_paths: Sequence[Path], output_path: Path) -> Path:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sibling_suffixes = (".shp", ".shx", ".dbf", ".prj", ".cpg", ".qmd", ".qml")
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for shp_path in shapefile_paths:
            shp_path = Path(shp_path)
            for suffix in sibling_suffixes:
                sibling = shp_path.with_suffix(suffix)
                if sibling.exists():
                    archive.write(sibling, arcname=sibling.name)
    return output_path


def load_json_file(path: Path) -> Dict[str, object]:
    return json.loads(Path(path).read_text(encoding="utf-8"))

