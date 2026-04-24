"""
classification/efficientnet.py - EfficientNet-B2 per-road-pixel condition classifier.

Loads the trained weights, extracts 32x32 patches centered on every road pixel,
runs batched inference, and writes three binary class TIFs plus one combined
palette-coded TIF.
"""

from pathlib import Path
from typing import List

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models
from tqdm import tqdm

from ..config import (
    BATCH_SIZE,
    CLASS_COLORS_RGBA,
    CLASS_NAMES,
    CLASS_VALUES,
    CLS_DIR,
    CLS_WEIGHTS,
    DEVICE,
    NUM_CLASSES,
    PATCH_SIZE,
    RASTER_COLOR_TABLE,
    REFLECTANCE_SCALE,
)
from ..io_utils import assert_crs_32642, read_mask, write_paletted_mask


def _build_model(weights_path: Path, device: str) -> nn.Module:
    """
    Reconstruct the EfficientNet-B2 with 4-channel input exactly as trained.
    """
    backbone = models.efficientnet_b2(weights=None)

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

    in_features = backbone.classifier[1].in_features
    backbone.classifier[1] = nn.Linear(in_features, NUM_CLASSES)

    state = torch.load(weights_path, map_location=device)
    backbone.load_state_dict(state)
    backbone.to(device)
    backbone.eval()
    return backbone


def build_model(weights_path: Path, device: str) -> nn.Module:
    return _build_model(Path(weights_path), device)


class _PatchDataset(Dataset):
    """
    Yields (4, PATCH_SIZE, PATCH_SIZE) float32 patches centered on road pixels.
    """

    def __init__(self, image_padded: np.ndarray, road_pixels: np.ndarray, patch_size: int):
        self.image_padded = image_padded
        self.road_pixels = road_pixels
        self.patch_size = patch_size
        self.pad = patch_size // 2

    def __len__(self) -> int:
        return len(self.road_pixels)

    def __getitem__(self, idx: int) -> torch.Tensor:
        row, col = self.road_pixels[idx]
        row_padded = row + self.pad
        col_padded = col + self.pad
        patch = self.image_padded[
            :,
            row_padded - self.pad: row_padded + self.pad,
            col_padded - self.pad: col_padded + self.pad,
        ]
        return torch.from_numpy(patch.astype(np.float32))


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
    """
    import rasterio

    stack_path = Path(stack_path)
    mask_path = Path(mask_path)
    output_dir = Path(output_dir) if output_dir else CLS_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    method_stem = stem or f"{stack_path.stem}_efficientnet"

    print(f"[EfficientNet] Loading model from {weights_path} ...")
    model = _build_model(weights_path, device)

    print(f"[EfficientNet] Reading stack from {stack_path} ...")
    with rasterio.open(stack_path) as src:
        profile = src.profile.copy()
        height, width = src.height, src.width
        raw = np.clip(src.read().astype(np.float32), 0.0, 10000.0) / REFLECTANCE_SCALE

    assert_crs_32642(profile)

    pad = patch_size // 2
    image_padded = np.pad(raw, ((0, 0), (pad, pad), (pad, pad)), mode="reflect")

    mask, _ = read_mask(mask_path)
    road_pixels = np.argwhere(mask == 1)
    print(f"[EfficientNet] Road pixels to classify: {len(road_pixels):,}")

    if len(road_pixels) == 0:
        print("[EfficientNet] WARNING: No road pixels in mask. Writing empty outputs.")
        empty = np.zeros((height, width), dtype=np.uint8)
        paths = []
        for cls_name in CLASS_NAMES:
            p = output_dir / f"{method_stem}_{cls_name}.tif"
            write_paletted_mask(
                p,
                empty,
                profile,
                {
                    0: (0, 0, 0, 0),
                    1: CLASS_COLORS_RGBA[cls_name],
                },
            )
            paths.append(p)
        combined_path = output_dir / f"{method_stem}_combined.tif"
        write_paletted_mask(combined_path, empty, profile, RASTER_COLOR_TABLE)
        paths.append(combined_path)
        return paths

    dataset = _PatchDataset(image_padded, road_pixels, patch_size)
    dataloader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0,
        pin_memory=(device == "cuda"),
    )

    all_preds: List[np.ndarray] = []
    with torch.no_grad():
        for batch in tqdm(dataloader, desc="[EfficientNet] Classifying patches"):
            batch = batch.to(device)
            logits = model(batch)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.append(preds)

    predictions = np.concatenate(all_preds)
    prediction_map = np.zeros((height, width), dtype=np.uint8)
    rows, cols = road_pixels[:, 0], road_pixels[:, 1]
    prediction_map[rows, cols] = (predictions + 1).astype(np.uint8)

    output_paths: List[Path] = []
    for cls_name in CLASS_NAMES:
        value = CLASS_VALUES[cls_name]
        binary = (prediction_map == value).astype(np.uint8)
        path = output_dir / f"{method_stem}_{cls_name}.tif"
        write_paletted_mask(
            path,
            binary,
            profile,
            {
                0: (0, 0, 0, 0),
                1: CLASS_COLORS_RGBA[cls_name],
            },
        )
        print(f"[EfficientNet] {cls_name}: {binary.sum():,} pixels -> {path.name}")
        output_paths.append(path)

    combined_path = output_dir / f"{method_stem}_combined.tif"
    write_paletted_mask(combined_path, prediction_map, profile, RASTER_COLOR_TABLE)
    print(f"[EfficientNet] Combined map -> {combined_path.name}")
    output_paths.append(combined_path)

    return output_paths
