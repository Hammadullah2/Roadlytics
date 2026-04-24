"""
classification/efficientnet.py — EfficientNet-B2 per-road-pixel condition classifier.

Loads the trained weights, extracts 32×32 patches centred on every road pixel,
runs batched inference, and writes three binary class TIFs + one combined TIF.

Class mapping (DO NOT SWAP — matches training):
  model output 0 → good    → raster value 1
  model output 1 → unpaved → raster value 2
  model output 2 → damaged → raster value 3
"""

from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models
from tqdm import tqdm

from ..config import (
    BATCH_SIZE,
    CLASS_NAMES,
    CLASS_VALUES,
    CLS_DIR,
    CLS_WEIGHTS,
    DEVICE,
    NUM_CLASSES,
    PATCH_SIZE,
    REFLECTANCE_SCALE,
)
from ..io_utils import assert_crs_32642, read_mask, write_binary_mask


# ── Model construction ─────────────────────────────────────────────────────────

def _build_model(weights_path: Path, device: str) -> nn.Module:
    """
    Reconstruct the EfficientNet-B2 with 4-channel input exactly as trained.
    We do NOT re-copy ImageNet weights here — the checkpoint overwrites everything.
    """
    backbone = models.efficientnet_b2(weights=None)

    # Patch stem conv: 3ch → 4ch
    old_conv = backbone.features[0][0]
    new_conv = nn.Conv2d(
        4,
        old_conv.out_channels,
        kernel_size=old_conv.kernel_size,
        stride=old_conv.stride,
        padding=old_conv.padding,
        bias=False,
    )
    backbone.features[0][0] = new_conv

    # Replace classifier head with 3-class linear
    in_features = backbone.classifier[1].in_features
    backbone.classifier[1] = nn.Linear(in_features, NUM_CLASSES)

    state = torch.load(weights_path, map_location=device)
    backbone.load_state_dict(state)
    backbone.to(device)
    backbone.eval()
    return backbone


def build_model(weights_path: Path, device: str) -> nn.Module:
    """Public entry point for loading the EfficientNet-B2 classification model."""
    return _build_model(Path(weights_path), device)


# ── Inference dataset ──────────────────────────────────────────────────────────

class _PatchDataset(Dataset):
    """Yields (4, PATCH_SIZE, PATCH_SIZE) float32 patches centred on road pixels."""

    def __init__(self, image_padded: np.ndarray, road_pixels: np.ndarray, patch_size: int):
        self.image_padded = image_padded   # (4, H+2*pad, W+2*pad)
        self.road_pixels  = road_pixels    # (N, 2) array of (row, col) in *original* coords
        self.patch_size   = patch_size
        self.pad          = patch_size // 2

    def __len__(self) -> int:
        return len(self.road_pixels)

    def __getitem__(self, idx: int) -> torch.Tensor:
        r, c = self.road_pixels[idx]
        # Offset by pad because image_padded was padded by self.pad on each side
        r_pad = r + self.pad
        c_pad = c + self.pad
        patch = self.image_padded[:, r_pad - self.pad: r_pad + self.pad,
                                      c_pad - self.pad: c_pad + self.pad]
        return torch.from_numpy(patch.astype(np.float32))


# ── Main inference function ────────────────────────────────────────────────────

def run(
    stack_path: Path,
    mask_path: Path,
    stem: str = None,
    output_dir: Path = None,
    weights_path: Path = CLS_WEIGHTS,
    device: str = DEVICE,
    batch_size: int = BATCH_SIZE,
    patch_size: int = PATCH_SIZE,
) -> List[Path]:
    """
    Run EfficientNet-B2 condition classification on road pixels and write TIFs.

    Parameters
    ----------
    stack_path  : Path to the raw 4-band Sentinel-2 GeoTIFF.
    mask_path   : Path to the binary road-mask TIF (from segmentation stage).
    stem        : Output filename stem (default: derived from stack_path + method).
    output_dir  : Folder for output TIFs (default: CLS_DIR from config).
    weights_path: Path to the classifier .pth file.
    device      : "cuda" or "cpu".
    batch_size  : Inference batch size (default 256).
    patch_size  : Patch side length in pixels (default 32).

    Returns
    -------
    List of Paths: [good_tif, unpaved_tif, damaged_tif, combined_tif]
    """
    import rasterio

    stack_path = Path(stack_path)
    mask_path  = Path(mask_path)
    output_dir = Path(output_dir) if output_dir else CLS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    method_stem = stem or f"{stack_path.stem}_efficientnet"

    print(f"[EfficientNet] Loading model from {weights_path} …")
    model = _build_model(weights_path, device)

    # ── Load stack ────────────────────────────────────────────────────────────
    print(f"[EfficientNet] Reading stack from {stack_path} …")
    with rasterio.open(stack_path) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        raw = np.clip(src.read().astype(np.float32), 0.0, 10000.0) / REFLECTANCE_SCALE

    assert_crs_32642(profile)

    # Pad with reflect mode; pad = patch_size // 2
    pad = patch_size // 2
    image_padded = np.pad(raw, ((0, 0), (pad, pad), (pad, pad)), mode="reflect")

    # ── Load road mask ────────────────────────────────────────────────────────
    mask, _ = read_mask(mask_path)
    road_pixels = np.argwhere(mask == 1)   # (N, 2) rows of (row, col)
    print(f"[EfficientNet] Road pixels to classify: {len(road_pixels):,}")

    if len(road_pixels) == 0:
        print("[EfficientNet] WARNING: No road pixels in mask. Writing empty outputs.")
        empty = np.zeros((H, W), dtype=np.uint8)
        paths = []
        for cls_name in CLASS_NAMES:
            p = output_dir / f"{method_stem}_{cls_name}.tif"
            write_binary_mask(p, empty, profile)
            paths.append(p)
        combined_path = output_dir / f"{method_stem}_combined.tif"
        write_binary_mask(combined_path, empty, profile)
        paths.append(combined_path)
        return paths

    # ── Batched inference ─────────────────────────────────────────────────────
    dataset    = _PatchDataset(image_padded, road_pixels, patch_size)
    dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=False,
                            num_workers=0, pin_memory=(device == "cuda"))

    all_preds: List[np.ndarray] = []
    with torch.no_grad():
        for batch in tqdm(dataloader, desc="[EfficientNet] Classifying patches"):
            batch = batch.to(device)
            logits = model(batch)
            preds  = logits.argmax(dim=1).cpu().numpy()
            all_preds.append(preds)

    all_preds_arr = np.concatenate(all_preds)   # (N,) — model 0-indexed output

    # ── Build prediction map (raster value = class_index + 1) ─────────────────
    prediction_map = np.zeros((H, W), dtype=np.uint8)
    rows, cols = road_pixels[:, 0], road_pixels[:, 1]
    prediction_map[rows, cols] = (all_preds_arr + 1).astype(np.uint8)

    # ── Split into 3 binary TIFs + combined TIF ───────────────────────────────
    output_paths: List[Path] = []
    for cls_name in CLASS_NAMES:
        val = CLASS_VALUES[cls_name]
        binary = (prediction_map == val).astype(np.uint8)
        p = output_dir / f"{method_stem}_{cls_name}.tif"
        write_binary_mask(p, binary, profile)
        print(f"[EfficientNet] {cls_name}: {binary.sum():,} pixels → {p.name}")
        output_paths.append(p)

    combined_path = output_dir / f"{method_stem}_combined.tif"
    write_binary_mask(combined_path, prediction_map, profile)
    print(f"[EfficientNet] Combined map → {combined_path.name}")
    output_paths.append(combined_path)

    return output_paths
