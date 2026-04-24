"""Condition classification — P4.

Raster-based classification. Calls road_pipeline classification modules directly.
"""

import sys
from pathlib import Path
import rasterio
import numpy as np

# road_pipeline lives at repo root
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def classify(
    norm_path: Path,
    output_dir: Path,
    model,                # torch.nn.Module or None
    config: dict,
    device: str,
    progress_callback=None,
    seg_path: Path = None,
) -> dict:
    """
    Classify road pixels by condition (raster-only).

    Returns
    -------
    dict with keys: "combined", "good", "damaged", "unpaved" (Paths)
    """
    classifier = config.get("classifier", "efficientnet")
    stem = f"{norm_path.stem}_{classifier}"

    if classifier == "kmeans":
        from road_pipeline.classification.kmeans import run as kmeans_run
        if progress_callback:
            progress_callback(10, "Starting K-Means classification")

        paths = kmeans_run(
            stack_path=norm_path,
            mask_path=seg_path,
            stem=stem,
            output_dir=output_dir,
        )
    else:
        if model is None:
            if progress_callback:
                progress_callback(100, "Classifier not loaded — returning empty masks")

            combined_path = output_dir / f"{stem}_combined.tif"
            with rasterio.open(seg_path) as src:
                mask = src.read(1)
                profile = src.profile.copy()

            combined = np.where(mask == 1, 2, 0).astype(np.uint8)
            with rasterio.open(combined_path, "w", **profile) as dst:
                dst.write(combined, 1)
            return {"combined": combined_path, "good": None, "damaged": None, "unpaved": None}

        if progress_callback:
            progress_callback(10, "Starting EfficientNet classification")

        paths = _run_efficientnet_with_preloaded_model(
            norm_path=norm_path,
            seg_path=seg_path,
            output_dir=output_dir,
            stem=stem,
            model=model,
            config=config,
            device=device,
            progress_callback=progress_callback,
        )

    if progress_callback:
        progress_callback(100, "Classification complete")

    # paths order: [good, damaged, unpaved, combined]  (combined is last)
    result = {"combined": paths[-1], "good": None, "damaged": None, "unpaved": None}
    if len(paths) >= 4:
        result["good"]    = paths[0]
        result["damaged"] = paths[1]
        result["unpaved"] = paths[2]
    return result


def _run_efficientnet_with_preloaded_model(
    norm_path, seg_path, output_dir, stem, model, config, device, progress_callback
):
    from road_pipeline.classification.efficientnet import _PatchDataset
    from torch.utils.data import DataLoader
    from road_pipeline.config import CLASS_NAMES, CLASS_VALUES, REFLECTANCE_SCALE
    import torch
    
    ps = config.get("clf_patch_size", 32)
    bs = config.get("clf_batch_size", 256)
    
    with rasterio.open(norm_path) as src:
        profile = src.profile.copy()
        H, W = src.height, src.width
        raw = np.clip(src.read().astype(np.float32), 0.0, 10000.0) / REFLECTANCE_SCALE

    pad = ps // 2
    image_padded = np.pad(raw, ((0, 0), (pad, pad), (pad, pad)), mode="reflect")

    with rasterio.open(seg_path) as src:
        mask = src.read(1)
        
    road_pixels = np.argwhere(mask == 1)
    
    if len(road_pixels) == 0:
        empty = np.zeros((H, W), dtype=np.uint8)
        paths = []
        for cls_name in CLASS_NAMES:
            p = output_dir / f"{stem}_{cls_name}.tif"
            profile.update(dtype="uint8", count=1)
            with rasterio.open(p, "w", **profile) as dst:
                dst.write(empty, 1)
            paths.append(p)
        combined_path = output_dir / f"{stem}_combined.tif"
        with rasterio.open(combined_path, "w", **profile) as dst:
            dst.write(empty, 1)
        paths.append(combined_path)
        return paths

    dataset = _PatchDataset(image_padded, road_pixels, ps)
    dataloader = DataLoader(dataset, batch_size=bs, shuffle=False,
                            num_workers=0, pin_memory=(device == "cuda"))

    all_preds = []
    total_batches = len(dataloader)
    
    with torch.no_grad():
        for i, batch in enumerate(dataloader):
            batch = batch.to(device)
            logits = model(batch)
            preds = logits.argmax(dim=1).cpu().numpy()
            all_preds.append(preds)
            
            if progress_callback and i % max(1, total_batches // 10) == 0:
                pct = 10 + int((i + 1) / total_batches * 80)
                progress_callback(pct, f"Classifying: {i+1}/{total_batches} batches")

    all_preds_arr = np.concatenate(all_preds)
    prediction_map = np.zeros((H, W), dtype=np.uint8)
    rows, cols = road_pixels[:, 0], road_pixels[:, 1]
    prediction_map[rows, cols] = (all_preds_arr + 1).astype(np.uint8)

    output_paths = []
    profile.update(dtype="uint8", count=1)
    for cls_name in CLASS_NAMES:
        val = CLASS_VALUES[cls_name]
        binary = (prediction_map == val).astype(np.uint8)
        p = output_dir / f"{stem}_{cls_name}.tif"
        with rasterio.open(p, "w", **profile) as dst:
            dst.write(binary, 1)
        output_paths.append(p)

    combined_path = output_dir / f"{stem}_combined.tif"
    with rasterio.open(combined_path, "w", **profile) as dst:
        dst.write(prediction_map, 1)
    output_paths.append(combined_path)

    return output_paths
