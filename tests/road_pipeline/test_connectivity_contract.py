from pathlib import Path

import numpy as np
import pytest

pytest.importorskip("torch")
pytest.importorskip("rasterio")
pytest.importorskip("scipy")

import rasterio
from rasterio.transform import from_origin

from road_pipeline.analytics.connectivity import run as connectivity_run
from road_pipeline.config import CLASS_VALUES


def _write_mask(path: Path, array: np.ndarray) -> None:
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=array.shape[0],
        width=array.shape[1],
        count=1,
        dtype=array.dtype,
        crs="EPSG:32642",
        transform=from_origin(500000, 2800000, 10, 10),
    ) as dst:
        dst.write(array, 1)


def test_connectivity_summary_contains_phase_one_keys(tmp_path: Path) -> None:
    seg_mask = np.array(
        [
            [0, 1, 1],
            [0, 1, 0],
            [1, 1, 0],
        ],
        dtype=np.uint8,
    )
    combined = np.array(
        [
            [0, CLASS_VALUES["good"], CLASS_VALUES["good"]],
            [0, CLASS_VALUES["unpaved"], 0],
            [CLASS_VALUES["damaged"], CLASS_VALUES["damaged"], 0],
        ],
        dtype=np.uint8,
    )

    seg_path = tmp_path / "seg_mask.tif"
    combined_path = tmp_path / "combined.tif"
    output_dir = tmp_path / "connectivity"

    _write_mask(seg_path, seg_mask)
    _write_mask(combined_path, combined)

    artifacts = connectivity_run(seg_path, combined_path, output_dir)

    assert artifacts.summary_json.exists()
    summary = artifacts.stats
    assert summary["component_count"] == 1
    assert "largest_component_length_km" in summary
    assert "critical_junction_count" in summary
