"""Fetches Sentinel-2 L2A imagery from the SentinelHub Process API."""

import uuid
from datetime import date
from pathlib import Path
from typing import Optional

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from sentinelhub import (
    SHConfig, DataCollection, MimeType, CRS, BBox,
    SentinelHubRequest, bbox_to_dimensions, SentinelHubCatalog,
)

from .config import settings


class SentinelHubFetcher:
    """Download Sentinel-2 L2A imagery for a given AOI and date range."""

    # Evalscript: returns B02, B03, B04, B08 bands + SCL in a single GeoTIFF
    # Order matches the U-Net's expected 4-channel input, with SCL as band 5
    # used only for cloud masking during preprocessing.
    EVALSCRIPT = """
//VERSION=3
function setup() {
    return {
        input: [{
            bands: ["B02", "B03", "B04", "B08", "SCL"],
            units: "DN"
        }],
        output: {
            bands: 5,
            sampleType: "UINT16"
        }
    };
}

function evaluatePixel(sample) {
    return [
        sample.B02,
        sample.B03,
        sample.B04,
        sample.B08,
        sample.SCL
    ];
}
"""

    def __init__(self):
        config = SHConfig()
        config.sh_client_id     = settings.sh_client_id
        config.sh_client_secret = settings.sh_client_secret
        if not config.sh_client_id or not config.sh_client_secret:
            raise RuntimeError(
                "SentinelHub credentials missing. "
                "Set SH_CLIENT_ID and SH_CLIENT_SECRET in environment."
            )
        self.config = config

    def find_least_cloudy_scene(
        self,
        bbox: BBox,
        start_date: str,
        end_date: str,
        max_cloud_cover: float = 0.20,
    ) -> Optional[dict]:
        """Query the SH Catalog API for the least cloudy scene in date range."""
        catalog = SentinelHubCatalog(config=self.config)
        search  = catalog.search(
            collection = DataCollection.SENTINEL2_L2A,
            bbox       = bbox,
            time       = (start_date, end_date),
            filter     = f"eo:cloud_cover < {max_cloud_cover * 100}",
            fields     = {
                "include": ["id", "properties.datetime",
                            "properties.eo:cloud_cover"]
            }
        )
        results = list(search)
        if not results:
            return None
        results.sort(key=lambda x: x["properties"]["eo:cloud_cover"])
        return results[0]

    def fetch_geotiff(
        self,
        aoi_bbox:        tuple,            # (min_lon, min_lat, max_lon, max_lat)
        start_date:      str,              # "YYYY-MM-DD"
        end_date:        str,              # "YYYY-MM-DD"
        output_path:     Path,
        resolution_m:    int   = 10,
        max_cloud_cover: float = 0.20,
    ) -> dict:
        """
        Download Sentinel-2 L2A imagery for the AOI and return metadata.

        Returns a dict with:
            path              — local GeoTIFF path
            scene_id          — Sentinel-2 scene identifier
            acquisition_date  — ISO date string
            cloud_cover       — reported cloud cover fraction
            bbox              — original AOI bbox
            size_px           — (width, height) in pixels
        """
        min_lon, min_lat, max_lon, max_lat = aoi_bbox
        bbox = BBox(bbox=[min_lon, min_lat, max_lon, max_lat], crs=CRS.WGS84)
        size = bbox_to_dimensions(bbox, resolution=resolution_m)

        if size[0] > 2500 or size[1] > 2500:
            raise ValueError(
                f"Requested AOI too large for 10m resolution: "
                f"{size[0]}×{size[1]} pixels exceeds 2500×2500 limit. "
                f"Reduce AOI or request coarser resolution."
            )

        scene = self.find_least_cloudy_scene(
            bbox, start_date, end_date, max_cloud_cover)
        if scene is None:
            raise ValueError(
                f"No Sentinel-2 scenes found in {start_date} to {end_date} "
                f"with cloud cover < {max_cloud_cover * 100:.0f}%. "
                f"Try expanding the date range."
            )

        scene_date  = scene["properties"]["datetime"][:10]
        scene_cloud = scene["properties"]["eo:cloud_cover"] / 100.0

        request = SentinelHubRequest(
            evalscript = self.EVALSCRIPT,
            input_data = [
                SentinelHubRequest.input_data(
                    data_collection = DataCollection.SENTINEL2_L2A,
                    time_interval   = (scene_date, scene_date),
                    maxcc           = max_cloud_cover,
                )
            ],
            responses = [
                SentinelHubRequest.output_response("default", MimeType.TIFF)
            ],
            bbox    = bbox,
            size    = size,
            config  = self.config,
        )

        data = request.get_data()[0]
        if data is None:
            raise RuntimeError("SentinelHub returned no data for this request.")

        # Write as georeferenced GeoTIFF
        transform = from_bounds(
            min_lon, min_lat, max_lon, max_lat, size[0], size[1])

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(
            output_path, "w",
            driver   = "GTiff",
            height   = size[1],
            width    = size[0],
            count    = 5,
            dtype    = "uint16",
            crs      = "EPSG:4326",
            transform= transform,
            compress = "lzw",
            nodata   = 0,
        ) as dst:
            for i in range(5):
                dst.write(data[:, :, i].astype(np.uint16), i + 1)

        return {
            "path":             str(output_path),
            "scene_id":         scene["id"],
            "acquisition_date": scene_date,
            "cloud_cover":      round(scene_cloud, 4),
            "bbox":             list(aoi_bbox),
            "size_px":          list(size),
        }
