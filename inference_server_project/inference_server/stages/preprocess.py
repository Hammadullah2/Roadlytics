"""Validation and normalisation — P1 + P2 combined."""

import subprocess, tempfile, os
from pathlib import Path
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, calculate_default_transform


CLOUD_SCL_VALUES = {3, 8, 9, 10}


def validate_input(tif_path: Path, config: dict) -> None:
    """Reject uploads that cannot be processed. Raises ValueError on failure."""
    with rasterio.open(tif_path) as src:
        if src.count < config["required_bands"]:
            raise ValueError(
                f"Input has {src.count} bands; "
                f"{config['required_bands']} required (B02, B03, B04, B08)."
            )
        if src.width < 256 or src.height < 256:
            raise ValueError(
                f"Image {src.width}x{src.height} below minimum 256x256 pixels."
            )
        if src.crs is None:
            raise ValueError("GeoTIFF is missing CRS metadata.")


def check_cloud_cover(tif_path: Path, config: dict) -> float:
    """Compute cloud cover from SCL band (band 5 in SentinelHub output)."""
    with rasterio.open(tif_path) as src:
        if src.count < 5:
            return 0.0   # no SCL band available — skip check
        scl = src.read(5)
    cloud_fraction = np.isin(scl, list(CLOUD_SCL_VALUES)).mean()
    return float(cloud_fraction)


def preprocess(
    tif_path: Path,
    output_dir: Path,
    config: dict,
    progress_callback=None,
) -> Path:
    """
    Validates, reprojects to target CRS at 10m, masks clouds, normalises to 0-1.
    Returns path to normalised.tif.
    """
    if progress_callback:
        progress_callback(10, "Validating GeoTIFF")
    validate_input(tif_path, config)

    if progress_callback:
        progress_callback(25, "Checking cloud cover")
    cloud_fraction = check_cloud_cover(tif_path, config)
    if cloud_fraction > config["cloud_cover_limit"]:
        raise ValueError(
            f"Cloud cover {cloud_fraction*100:.1f}% exceeds "
            f"{config['cloud_cover_limit']*100:.0f}% threshold."
        )

    if progress_callback:
        progress_callback(45, f"Reprojecting to {config['target_crs']}")
    reproj_path = output_dir / "reproj.tif"
    with rasterio.open(tif_path) as src:
        transform, width, height = calculate_default_transform(
            src.crs, config["target_crs"],
            src.width, src.height, *src.bounds,
            resolution=10.0,
        )
        profile = src.profile.copy()
        profile.update({
            "crs":       config["target_crs"],
            "transform": transform,
            "width":     width,
            "height":    height,
        })
        with rasterio.open(reproj_path, "w", **profile) as dst:
            for i in range(1, min(src.count + 1, 6)):
                resampling = (Resampling.nearest
                              if i == 5 else Resampling.bilinear)
                reproject(
                    source      = rasterio.band(src, i),
                    destination = rasterio.band(dst, i),
                    src_transform = src.transform, src_crs = src.crs,
                    dst_transform = transform,     dst_crs = config["target_crs"],
                    resampling = resampling,
                )

    if progress_callback:
        progress_callback(75, "Masking clouds and normalising")
    norm_path = output_dir / "normalised.tif"
    with rasterio.open(reproj_path) as src:
        data    = src.read().astype(np.float32)
        profile = src.profile.copy()

    spectral   = data[:4]
    has_scl    = data.shape[0] >= 5
    cloud_mask = (np.isin(data[4].astype(int), list(CLOUD_SCL_VALUES))
                  if has_scl else np.zeros(spectral.shape[1:], dtype=bool))

    div    = config["normalisation_divisor"]
    nodata = config["nodata_value"]

    normalised = np.where(
        cloud_mask[np.newaxis, :, :],
        nodata,
        spectral / div
    ).astype(np.float32)

    normalised[spectral == 0] = nodata

    profile.update({
        "count":    4,
        "dtype":    "float32",
        "nodata":   nodata,
        "compress": "lzw",
    })
    with rasterio.open(norm_path, "w", **profile) as dst:
        dst.write(normalised)

    reproj_path.unlink()

    if progress_callback:
        progress_callback(100, "Preprocessing complete")

    return norm_path
