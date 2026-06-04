# Project Context

Roadlytics is a web-based road intelligence application for processing Sentinel-2 Level-2 GeoTIFF imagery and producing road segmentation, road-condition masks, connectivity analytics, map overlays, reports, and assistant explanations.

## User Workflow

1. A user uploads a four-band Sentinel-2 L2 GeoTIFF in B2, B3, B4, B8 order.
2. The user chooses a segmentation method:
   - `DeepLabV3`
   - `PakOSM`
3. The user chooses a condition-classification method:
   - `KMeans`
   - `EfficientNet`
4. Roadlytics produces:
   - Road segmentation GeoTIFF.
   - Good road mask in green.
   - Unpaved road mask in red.
   - Damaged road mask in yellow.
   - Combined condition mask containing all three classes.
   - Connected-components raster.
   - Betweenness/criticality raster.
   - Connected-components CSV.
   - Analytics summary JSON.
   - Critical junctions GeoJSON.
   - Road-condition shapefile ZIP.
   - HTML report.
5. The frontend shows OSM as the fixed base layer, with Sentinel RGB and output layers toggleable above it.

## Important Domain Rules

- The uploaded image must be a GeoTIFF with exactly four bands in B2, B3, B4, B8 order.
- Road-condition color mapping is fixed:
  - `good`: green
  - `unpaved`: red
  - `damaged`: yellow
- The model outputs are decision-support signals, not field-confirmed truth.
- PakOSM needs Pakistan OSM shapefiles under `data/osm_roads` locally or `/assets/osm_roads` on Modal.
- Model weights are not committed to Git; they live in `model_weights` locally and in a Modal Volume for Modal inference.

## Model Assets

Observed local asset names:

```text
model_weights/road segmentation.pth
model_weights/road_condition_model.pth
data/osm_roads/gis_osm_roads_free_1.shp
data/osm_roads/gis_osm_roads_free_1.dbf
data/osm_roads/gis_osm_roads_free_1.shx
data/osm_roads/gis_osm_roads_free_1.prj
data/osm_roads/gis_osm_roads_free_1.cpg
```
