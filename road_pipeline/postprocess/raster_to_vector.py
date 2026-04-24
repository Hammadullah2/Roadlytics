"""
postprocess/raster_to_vector.py — Polygonize binary road-condition TIFs → Shapefiles.

Per-class output (Option A as per §7.3 of the implementation plan):
  • One .shp per class (good / unpaved / damaged)
  • Each .shp has a sibling .qml QGIS style file with the class fill colour

No combined shapefile, no GeoJSON (locked decisions §7.3 & §7.5).
"""

from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.features
from shapely.geometry import shape

from ..config import (
    CLASS_COLORS_RGBA,
    CLASS_NAMES,
    MIN_POLYGON_AREA_M2,
    SHP_DIR,
    SIMPLIFY_TOLERANCE_M,
)


# ── QGIS .qml style template ──────────────────────────────────────────────────

_QML_TEMPLATE = """\
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.0" styleCategories="Symbology">
  <renderer-v2 type="singleSymbol" forceraster="0" symbollevels="0">
    <symbols>
      <symbol name="0" type="fill" clip_to_extent="1">
        <layer class="SimpleFill">
          <Option type="Map">
            <Option value="{r},{g},{b},{a}" name="color" type="QString"/>
            <Option value="solid" name="style" type="QString"/>
            <Option value="no" name="border_width_map_unit_scale" type="QString"/>
            <Option value="0.26,0.26,0.26,255" name="outline_color" type="QString"/>
            <Option value="no" name="outline_style" type="QString"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
    <rotation/>
    <sizescale/>
  </renderer-v2>
</qgis>
"""


def _write_qml(qml_path: Path, rgba: Tuple[int, int, int, int]) -> None:
    r, g, b, a = rgba
    content = _QML_TEMPLATE.format(r=r, g=g, b=b, a=a)
    qml_path.write_text(content, encoding="utf-8")


# ── Core polygonization ────────────────────────────────────────────────────────

def _polygonize_binary_tif(
    tif_path: Path,
    min_area_m2: float = MIN_POLYGON_AREA_M2,
    simplify_tolerance_m: float = SIMPLIFY_TOLERANCE_M,
) -> gpd.GeoDataFrame:
    """
    Open a binary uint8 TIF (1 = road class, 0 = background) and return
    a GeoDataFrame of filtered, simplified polygons.
    """
    with rasterio.open(tif_path) as src:
        mask_arr  = src.read(1)
        transform = src.transform
        crs       = src.crs

    raw_shapes = list(
        rasterio.features.shapes(mask_arr, mask=(mask_arr == 1), transform=transform)
    )

    polys   = []
    areas   = []
    for geom_dict, val in raw_shapes:
        if val != 1:
            continue
        poly = shape(geom_dict)
        if poly.area < min_area_m2:
            continue
        if simplify_tolerance_m > 0:
            poly = poly.simplify(tolerance=simplify_tolerance_m, preserve_topology=True)
        if poly.is_empty:
            continue
        polys.append(poly)
        areas.append(round(poly.area, 2))

    if not polys:
        # Return empty GeoDataFrame with correct schema
        return gpd.GeoDataFrame(
            {"condition": [], "area_m2": [], "road_id": [], "geometry": []},
            crs=crs,
        )

    gdf = gpd.GeoDataFrame(
        {
            "road_id":   list(range(len(polys))),
            "condition": [tif_path.stem.rsplit("_", 1)[-1]] * len(polys),
            "area_m2":   areas,
            "geometry":  polys,
        },
        crs=crs,
    )
    return gdf


# ── Public API ─────────────────────────────────────────────────────────────────

def run(
    class_tifs: Dict[str, Path],
    output_dir: Path = None,
    min_area_m2: float = MIN_POLYGON_AREA_M2,
    simplify_tolerance_m: float = SIMPLIFY_TOLERANCE_M,
) -> List[Path]:
    """
    Polygonize each binary class TIF and write one .shp + one .qml per class.

    Parameters
    ----------
    class_tifs           : Mapping of class name → binary TIF path.
                           Keys must be a subset of {"good", "unpaved", "damaged"}.
    output_dir           : Folder for output shapefiles (default: SHP_DIR from config).
    min_area_m2          : Minimum polygon area in m² to keep (default 200 m²).
    simplify_tolerance_m : Simplification tolerance in metres (default 10 m).

    Returns
    -------
    List of Paths to the written .shp files.
    """
    output_dir = Path(output_dir) if output_dir else SHP_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    shp_paths: List[Path] = []

    for cls_name in CLASS_NAMES:
        tif_path = class_tifs.get(cls_name)
        if tif_path is None:
            print(f"[Vector] No TIF provided for class '{cls_name}', skipping.")
            continue

        tif_path = Path(tif_path)
        print(f"[Vector] Polygonizing {tif_path.name} …")

        gdf = _polygonize_binary_tif(tif_path, min_area_m2, simplify_tolerance_m)

        # Build output stem from TIF stem (strip last _<classname> suffix) + classname
        # e.g. "sindh_stacked_clipped1_efficientnet_good" → class already in name
        shp_path = output_dir / f"{tif_path.stem}.shp"
        gdf.to_file(shp_path)

        # Write matching QGIS style
        qml_path = shp_path.with_suffix(".qml")
        _write_qml(qml_path, CLASS_COLORS_RGBA[cls_name])

        n_polys   = len(gdf)
        total_m2  = gdf["area_m2"].sum() if n_polys else 0.0
        print(
            f"[Vector] {cls_name}: {n_polys:,} polygons, "
            f"total area {total_m2 / 1e6:.3f} km²  → {shp_path.name}"
        )
        shp_paths.append(shp_path)

    return shp_paths
