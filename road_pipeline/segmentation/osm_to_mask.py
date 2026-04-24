"""
segmentation/osm_to_mask.py - Convert an OSM roads shapefile to a binary raster mask.

Pipeline:
1. Open the raw TIF to get spatial extent, transform, CRS, and dimensions.
2. Open the OSM shapefile with geopandas.
3. Bbox-clip in shapefile CRS, then reproject the subset to raster CRS.
4. Precisely intersect with the raster footprint.
5. Buffer road geometries to give them pixel-scale width.
6. Rasterize to a binary uint8 mask.
7. Save with the raw TIF profile.
"""

from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
import rasterio.features
from shapely.geometry import box

from ..config import OSM_BUFFER_M, OSM_DIR, SEG_DIR
from ..io_utils import assert_crs_32642, write_binary_mask


def _default_osm_shapefile(osm_dir: Path) -> Path:
    preferred = osm_dir / "gis_osm_roads_free_1.shp"
    if preferred.exists():
        return preferred

    shapefiles = sorted(osm_dir.glob("*.shp"))
    if len(shapefiles) == 1:
        return shapefiles[0]

    return preferred


def run(
    input_tif: Path,
    output_dir: Path = None,
    osm_shp: Path = None,
    buffer_m: float = OSM_BUFFER_M,
) -> Path:
    """
    Rasterize an OSM road network onto the same grid as ``input_tif``.

    Parameters
    ----------
    input_tif  : Path to the raw 4-band Sentinel-2 GeoTIFF.
    output_dir : Folder for the output mask (default: SEG_DIR from config).
    osm_shp    : Path to gis_osm_roads_free_1.shp (default: OSM_DIR / filename).
    buffer_m   : Buffer radius in metres applied to road lines.

    Returns
    -------
    Path to the written segmentation mask GeoTIFF.
    """
    input_tif = Path(input_tif)
    output_dir = Path(output_dir) if output_dir else SEG_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    if osm_shp is None:
        osm_shp = _default_osm_shapefile(OSM_DIR)
    osm_shp = Path(osm_shp)

    if not osm_shp.exists():
        raise FileNotFoundError(
            f"OSM shapefile not found at {osm_shp}. "
            "Place gis_osm_roads_free_1.shp (+ .shx .dbf .prj .cpg) in "
            f"{OSM_DIR}"
        )

    output_path = output_dir / f"{input_tif.stem}_seg_osm.tif"

    with rasterio.open(input_tif) as src:
        profile = src.profile.copy()
        height, width = src.height, src.width
        transform = src.transform
        raster_crs = src.crs
        raster_bounds = src.bounds

    assert_crs_32642(profile)
    print(f"[OSM->Mask] Input raster: {height} x {width} | CRS: {raster_crs}")
    print(f"[OSM->Mask] Loading OSM shapefile from {osm_shp} ...")

    gdf = gpd.read_file(osm_shp)
    osm_crs = gdf.crs
    print(f"[OSM->Mask] Loaded {len(gdf):,} road features | OSM CRS: {osm_crs}")

    raster_poly = box(*raster_bounds)
    raster_gdf = gpd.GeoDataFrame(geometry=[raster_poly], crs=raster_crs)
    raster_in_osm_crs = raster_gdf.to_crs(osm_crs).iloc[0].geometry

    minx, miny, maxx, maxy = raster_in_osm_crs.bounds
    gdf_clip = gdf.cx[minx:maxx, miny:maxy].copy()
    print(f"[OSM->Mask] After bbox filter: {len(gdf_clip):,} features")

    if gdf_clip.empty:
        print("[OSM->Mask] No OSM roads intersect the raster extent. Writing an empty mask.")
        empty = np.zeros((height, width), dtype=np.uint8)
        write_binary_mask(output_path, empty, profile)
        return output_path

    gdf_reproj = gdf_clip.to_crs(raster_crs)
    raster_footprint = box(*raster_bounds)
    gdf_reproj = gdf_reproj[gdf_reproj.geometry.intersects(raster_footprint)].copy()
    gdf_reproj["geometry"] = gdf_reproj.geometry.intersection(raster_footprint)
    gdf_reproj = gdf_reproj[~gdf_reproj.geometry.is_empty].copy()
    print(f"[OSM->Mask] After precise intersection: {len(gdf_reproj):,} features")

    print(f"[OSM->Mask] Buffering roads by {buffer_m} m ...")
    gdf_reproj["geometry"] = gdf_reproj.geometry.buffer(buffer_m)
    gdf_reproj = gdf_reproj[~gdf_reproj.geometry.is_empty]

    print("[OSM->Mask] Rasterizing ...")
    shapes = (
        (geom, 1)
        for geom in gdf_reproj.geometry
        if geom is not None and not geom.is_empty
    )
    binary_mask = rasterio.features.rasterize(
        shapes,
        out_shape=(height, width),
        transform=transform,
        fill=0,
        default_value=1,
        dtype="uint8",
    )

    road_pct = binary_mask.sum() / (height * width) * 100
    print(f"[OSM->Mask] Road pixels: {binary_mask.sum():,} ({road_pct:.2f}%)")

    write_binary_mask(output_path, binary_mask, profile)
    print(f"[OSM->Mask] Segmentation mask saved -> {output_path}")
    return output_path
