# Road Pipeline

`road_pipeline` is the geospatial and ML engine behind Roadlytics.

## Inputs

- Sentinel-2 L2 GeoTIFF with 4 bands in `B2, B3, B4, B8` order
- Segmentation choice:
  - `DeepLabV3`
  - `PakOSM`
- Classification choice:
  - `KMeans`
  - `EfficientNet`

## Outputs

- Segmentation mask GeoTIFF
- `good` road mask GeoTIFF
- `unpaved` road mask GeoTIFF
- `damaged` road mask GeoTIFF
- combined road condition GeoTIFF
- road condition shapefile ZIP
- connectivity outputs:
  - `component_map.tif`
  - `betweenness_centrality.tif`
  - `connected_components.csv`
  - `analytics_summary.json`
  - `critical_junctions.geojson`

## Expected folders

```text
Roadlytics/
|-- model_weights/
|   |-- road segmentation.pth
|   `-- road_condition_model.pth
`-- data/
    |-- raw/
    |-- osm_roads/
    |   `-- gis_osm_roads_free_1.shp (+ .shx .dbf .prj .cpg)
    |-- segmentation masks/
    |-- classification masks/
    |-- classification shapefiles/
    `-- analytics/
```

## Notes

- `good` is written in green
- `unpaved` is written in red
- `damaged` is written in yellow
- `combined` preserves class values while embedding the palette for map display
- `PakOSM` reads the Pakistan OSM roads shapefile from `data/osm_roads/` by default

