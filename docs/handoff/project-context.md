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

## Connectivity Analytics Meaning

Roadlytics adds network-level analysis after segmentation and condition classification. This is important because road condition masks alone answer "where are road pixels and what class are they?", while connectivity analytics answer "how is this road network structured and which parts may matter most?"

Connected components:

- A connected component is a group of road pixels connected to each other under the selected neighborhood rule.
- Roadlytics uses 4-neighbor connectivity by default, so pixels connect through up, down, left, and right adjacency, not diagonals.
- Each component receives an ID in `component_map.tif`.
- Many small components can indicate fragmentation, disconnected roads, segmentation gaps, missing OSM coverage, or isolated rural road segments.
- `connected_components.csv` summarizes component-level statistics.

Betweenness criticality:

- Betweenness is a graph idea: a location is important if many shortest or low-cost paths pass through it.
- In Roadlytics, the graph is derived from road-mask pixels instead of manually drawn road shapefiles.
- Road condition affects traversal cost: good roads are cheaper, unpaved roads are more expensive, and damaged roads are most expensive.
- The `betweenness_centrality.tif` layer highlights pixels or regions that act like bottlenecks, connectors, or important corridors.
- High criticality does not prove a real-world bottleneck; it is a model-derived priority signal for inspection.

Critical junctions:

- Critical junctions are high-priority point features exported as `critical_junctions.geojson`.
- They are extracted from the raster-derived criticality/connectivity analysis.
- On the map they are a vector overlay that helps users quickly identify candidate intersections, connectors, or hotspots.
- They should be described as inspection priorities, not as field-confirmed dangerous junctions.

Critical overlay:

- In the UI, "critical overlay" generally means enabling the betweenness criticality raster and/or critical junction vector layer over the Sentinel RGB, combined road-condition mask, and fixed OSM base map.
- This overlay helps visually connect road-condition information with network importance.
- A useful demo is to show damaged roads and critical junctions together: this asks, "Which problematic road areas may also be important for connectivity?"

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
