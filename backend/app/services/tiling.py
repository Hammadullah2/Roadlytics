"""Raster tile rendering helpers for map overlays."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Dict, Optional

import numpy as np
from PIL import Image
from rio_tiler.io import Reader

from ..database import Repository
from ..storage.backends import StorageBackend

CLASS_COLORS = {
    1: np.array([34, 139, 34, 210], dtype=np.uint8),
    2: np.array([214, 57, 42, 210], dtype=np.uint8),
    3: np.array([240, 196, 25, 220], dtype=np.uint8),
}


def _png_bytes(rgba: np.ndarray) -> bytes:
    buffer = BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


def _to_rgba_tile(layer: str, data: np.ndarray, mask: Optional[np.ndarray]) -> np.ndarray:
    height, width = data.shape[1], data.shape[2]
    alpha_mask = np.ones((height, width), dtype=bool)
    if mask is not None:
        alpha_mask = mask > 0

    if layer == "sentinel":
        rgb = np.moveaxis(data[:3], 0, -1)
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[..., :3] = rgb
        rgba[..., 3] = np.where(alpha_mask, 255, 0)
        return rgba

    band = data[0]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)

    if layer == "segmentation":
        active = (band > 0) & alpha_mask
        rgba[active] = np.array([76, 109, 128, 200], dtype=np.uint8)
        return rgba

    if layer in {"good", "unpaved", "damaged"}:
        value_map = {"good": 1, "unpaved": 1, "damaged": 1}
        active = (band == value_map[layer]) & alpha_mask
        color = {
            "good": CLASS_COLORS[1],
            "unpaved": CLASS_COLORS[2],
            "damaged": CLASS_COLORS[3],
        }[layer]
        rgba[active] = color
        return rgba

    if layer == "combined":
        for class_value, color in CLASS_COLORS.items():
            active = (band == class_value) & alpha_mask
            rgba[active] = color
        return rgba

    if layer == "components":
        labels = band.astype(np.uint32)
        active = (labels > 0) & alpha_mask
        rgba[..., 0] = ((labels * 53) % 255).astype(np.uint8)
        rgba[..., 1] = ((labels * 97) % 255).astype(np.uint8)
        rgba[..., 2] = ((labels * 193) % 255).astype(np.uint8)
        rgba[..., 3] = np.where(active, 190, 0).astype(np.uint8)
        return rgba

    if layer == "betweenness":
        values = np.clip(band.astype(np.float32), 0.0, 1.0)
        rgba[..., 0] = (255 * values).astype(np.uint8)
        rgba[..., 1] = (180 * (1.0 - np.abs(values - 0.5) * 1.8)).clip(0, 180).astype(np.uint8)
        rgba[..., 2] = (48 * (1.0 - values)).astype(np.uint8)
        rgba[..., 3] = np.where(alpha_mask & (values > 0), (80 + values * 160).astype(np.uint8), 0)
        return rgba

    raise KeyError(layer)


class TileService:
    def __init__(self, repository: Repository, storage: StorageBackend) -> None:
        self.repository = repository
        self.storage = storage

    def _source_for_artifact(self, artifact: Dict[str, object]) -> str:
        local_path = artifact.get("local_path")
        if local_path and Path(local_path).exists():
            return str(local_path)
        return self.storage.generate_download_url(str(artifact["blob_path"]), expires_minutes=15)

    def tilejson(self, job_id: str, layer: str, base_url: str) -> Dict[str, object]:
        artifact = self.repository.get_layer_artifact(job_id, layer)
        if artifact is None:
            raise KeyError(layer)
        bounds = artifact.get("bounds") or [-180.0, -85.0, 180.0, 85.0]
        center = [
            (bounds[0] + bounds[2]) / 2.0,
            (bounds[1] + bounds[3]) / 2.0,
            11,
        ]
        return {
            "tilejson": "3.0.0",
            "name": layer,
            "scheme": "xyz",
            "tiles": [f"{base_url}/api/jobs/{job_id}/layers/{layer}" + "/{z}/{x}/{y}.png"],
            "bounds": bounds,
            "center": center,
            "minzoom": 0,
            "maxzoom": 22,
        }

    def render_tile(self, job_id: str, layer: str, z: int, x: int, y: int) -> bytes:
        artifact = self.repository.get_layer_artifact(job_id, layer)
        if artifact is None:
            raise KeyError(layer)
        source = self._source_for_artifact(artifact)
        with Reader(source) as reader:
            image = reader.tile(x, y, z)
        rgba = _to_rgba_tile(layer, image.data, image.mask)
        return _png_bytes(rgba)

