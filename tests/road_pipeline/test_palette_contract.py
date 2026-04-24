import pytest

pytest.importorskip("torch")

from road_pipeline.config import CLASS_COLORS_RGBA, RASTER_COLOR_TABLE


def test_palette_matches_requested_condition_colors() -> None:
    assert CLASS_COLORS_RGBA["good"] == (34, 139, 34, 255)
    assert CLASS_COLORS_RGBA["unpaved"] == (214, 57, 42, 255)
    assert CLASS_COLORS_RGBA["damaged"] == (240, 196, 25, 255)

    assert RASTER_COLOR_TABLE[1] == CLASS_COLORS_RGBA["good"]
    assert RASTER_COLOR_TABLE[2] == CLASS_COLORS_RGBA["unpaved"]
    assert RASTER_COLOR_TABLE[3] == CLASS_COLORS_RGBA["damaged"]

