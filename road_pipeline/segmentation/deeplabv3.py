"""
segmentation/deeplabv3.py — Sliding-window DeepLabV3+ inference.

Produces a binary road-mask GeoTIFF from a 4-band Sentinel-2 stack.
Logic ported from Cell 11 / Cell 13b of stage3_deeplabv3_colab.py.
"""

from pathlib import Path

import cv2
import numpy as np
import rasterio
import rasterio.windows
import torch
import segmentation_models_pytorch as smp
from tqdm import tqdm

from ..config import (
    DEVICE,
    ENCODER_NAME,
    IN_CHANNELS,
    REFLECTANCE_SCALE,
    SEG_DIR,
    SEG_WEIGHTS,
    SEG_THRESHOLD,
    STRIDE,
    TILE_SIZE,
)
from ..io_utils import assert_crs_32642, write_binary_mask


def _build_model(weights_path: Path, device: str) -> torch.nn.Module:
    """Build DeepLabV3+ and load weights. encoder_weights=None skips ImageNet download."""
    model = smp.DeepLabV3Plus(
        encoder_name=ENCODER_NAME,
        encoder_weights=None,   # we load our own weights
        in_channels=IN_CHANNELS,
        classes=1,
        activation=None,
    )
    state = torch.load(weights_path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    return model


def build_model(weights_path: Path, device: str) -> torch.nn.Module:
    """Public entry point for loading the DeepLabV3+ segmentation model."""
    return _build_model(Path(weights_path), device)


def run(
    input_tif: Path,
    output_dir: Path = None,
    threshold: float = SEG_THRESHOLD,
    weights_path: Path = SEG_WEIGHTS,
    device: str = DEVICE,
    tile_size: int = TILE_SIZE,
    stride: int = STRIDE,
) -> Path:
    """
    Run DeepLabV3+ inference on ``input_tif`` and write a binary road-mask TIF.

    Parameters
    ----------
    input_tif   : Path to the raw 4-band Sentinel-2 GeoTIFF.
    output_dir  : Folder to write the mask into (default: SEG_DIR from config).
    threshold   : Sigmoid probability threshold for road/non-road (default 0.5).
    weights_path: Path to the model .pth file.
    device      : "cuda" or "cpu".
    tile_size   : Tile height/width in pixels (default 1024).
    stride      : Sliding-window stride in pixels (default 512).

    Returns
    -------
    Path to the written segmentation mask GeoTIFF.
    """
    input_tif  = Path(input_tif)
    output_dir = Path(output_dir) if output_dir else SEG_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / f"{input_tif.stem}_seg_deeplab.tif"

    print(f"[DeepLabV3+] Loading model from {weights_path} …")
    model = _build_model(weights_path, device)

    with rasterio.open(input_tif) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        assert_crs_32642(profile)
        print(f"[DeepLabV3+] Input raster: {H} × {W} pixels  |  CRS: {profile.get('crs')}")

        pred_sum   = np.zeros((H, W), dtype=np.float32)
        pred_count = np.zeros((H, W), dtype=np.float32)

        row_starts = list(range(0, H, stride))
        col_starts = list(range(0, W, stride))
        total = len(row_starts) * len(col_starts)

        with tqdm(total=total, desc="[DeepLabV3+] Sliding-window inference") as pbar:
            for r in row_starts:
                for c in col_starts:
                    r_end = min(r + tile_size, H)
                    c_end = min(c + tile_size, W)

                    window = rasterio.windows.Window(c, r, c_end - c, r_end - r)
                    patch  = src.read(window=window).astype(np.float32) / REFLECTANCE_SCALE
                    patch  = np.clip(patch, 0.0, 1.0)

                    ph, pw = patch.shape[1], patch.shape[2]
                    if ph < tile_size or pw < tile_size:
                        padded = np.zeros((IN_CHANNELS, tile_size, tile_size), dtype=np.float32)
                        padded[:, :ph, :pw] = patch
                        patch = padded

                    with torch.no_grad():
                        tensor = torch.from_numpy(patch).unsqueeze(0).to(device)
                        logit  = model(tensor)
                        prob   = torch.sigmoid(logit).squeeze().cpu().numpy()

                    pred_sum[r:r_end, c:c_end]   += prob[:r_end - r, :c_end - c]
                    pred_count[r:r_end, c:c_end] += 1.0
                    pbar.update(1)

    pred_avg    = pred_sum / np.maximum(pred_count, 1e-6)
    binary_mask = (pred_avg > threshold).astype(np.uint8)

    # Morphological closing with 5×5 cross kernel (matches training Cell 11)
    kernel      = cv2.getStructuringElement(cv2.MORPH_CROSS, (5, 5))
    binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)

    road_pct = binary_mask.sum() / (H * W) * 100
    print(f"[DeepLabV3+] Road pixels: {binary_mask.sum():,} ({road_pct:.2f}%)")

    write_binary_mask(output_path, binary_mask, profile)
    print(f"[DeepLabV3+] Segmentation mask saved → {output_path}")
    return output_path
