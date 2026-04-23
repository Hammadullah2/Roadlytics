# GeoJSON Contract Specification

This document defines the **exact data format** the AI model must write to
Supabase after processing. The model team should implement against this spec.

## Pipeline Order (Sequential / Streaming)

The model processes in **3 sequential stages**, writing results after each:

```
Stage 1: Segmentation  →  writes to segmentation_results
Stage 2: Classification →  writes to classification_results
Stage 3: Connectivity   →  writes to connectivity_graphs
```

Each stage updates the `jobs` table progress and status independently.

---

## Stage 1: Segmentation Result

The model identifies road pixels from the satellite/GeoJSON input and outputs
road segments as a GeoJSON FeatureCollection.

**Write to**: `segmentation_results.geojson_data`

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "seg_001",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [67.0011, 25.3960],
          [67.0015, 25.3965],
          [67.0020, 25.3970]
        ]
      },
      "properties": {
        "segment_id": "seg_001",
        "length_meters": 124.5,
        "width_meters": 6.2
      }
    },
    {
      "type": "Feature",
      "id": "seg_002",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [67.0020, 25.3970],
          [67.0028, 25.3978]
        ]
      },
      "properties": {
        "segment_id": "seg_002",
        "length_meters": 98.3,
        "width_meters": 5.8
      }
    }
  ]
}
```

### Field Reference

| Field                        | Type       | Required | Description                          |
|------------------------------|------------|----------|--------------------------------------|
| `features[].id`              | string     | Yes      | Unique segment ID (e.g. `seg_001`)   |
| `geometry.type`              | string     | Yes      | Always `"LineString"`                |
| `geometry.coordinates`       | number[][] | Yes      | `[longitude, latitude]` pairs (WGS84)|
| `properties.segment_id`     | string     | Yes      | Same as `id`, for convenience        |
| `properties.length_meters`  | number     | Yes      | Physical length of the segment       |
| `properties.width_meters`   | number     | No       | Estimated road width                 |

---

## Stage 2: Classification Result

The model classifies each segmented road into a condition category.

**Write to**: `classification_results` table (one row per segment)

| Column           | Type    | Value                                    |
|------------------|---------|------------------------------------------|
| `segmentation_id`| UUID   | FK to the segmentation_results row       |
| `patch_id`       | string | Must match a `segment_id` from Stage 1   |
| `road_label`     | string | One of: `"Good"`, `"Damaged"`, `"Unpaved"` |
| `confidence`     | float  | 0.0 to 1.0                               |
| `geometry`       | JSONB  | Copy of the segment's GeoJSON geometry   |

The `geometry` field is duplicated from segmentation so the frontend can render
classification results independently without joining.

**Example row**:
```json
{
  "patch_id": "seg_001",
  "road_label": "Damaged",
  "confidence": 0.87,
  "geometry": {
    "type": "LineString",
    "coordinates": [[67.0011, 25.3960], [67.0015, 25.3965], [67.0020, 25.3970]]
  }
}
```

---

## Stage 3: Connectivity Graph

The model builds a graph from the road network and analyzes connectivity.

**Write to**: `connectivity_graphs` table

### `graph_data` (JSONB)

An adjacency list representation of the road network graph:

```json
{
  "nodes": [
    {
      "id": "node_001",
      "coordinates": [67.0011, 25.3960],
      "type": "intersection"
    },
    {
      "id": "node_002",
      "coordinates": [67.0020, 25.3970],
      "type": "intersection"
    },
    {
      "id": "node_003",
      "coordinates": [67.0028, 25.3978],
      "type": "endpoint"
    }
  ],
  "edges": [
    {
      "id": "edge_001",
      "source": "node_001",
      "target": "node_002",
      "segment_id": "seg_001",
      "weight": 124.5,
      "road_label": "Damaged"
    },
    {
      "id": "edge_002",
      "source": "node_002",
      "target": "node_003",
      "segment_id": "seg_002",
      "weight": 98.3,
      "road_label": "Good"
    }
  ],
  "components": [
    {
      "component_id": 0,
      "node_ids": ["node_001", "node_002", "node_003"]
    }
  ]
}
```

### `metrics` (JSONB)

```json
{
  "total_nodes": 42,
  "total_edges": 56,
  "total_components": 3,
  "largest_component_size": 38,
  "isolated_nodes": 2,
  "average_degree": 2.67,
  "total_road_length_meters": 12450.8,
  "road_condition_summary": {
    "good_km": 6.2,
    "damaged_km": 4.1,
    "unpaved_km": 2.15
  }
}
```

### Field Reference — Nodes

| Field         | Type     | Required | Description                              |
|---------------|----------|----------|------------------------------------------|
| `id`          | string   | Yes      | Unique node ID                           |
| `coordinates` | number[] | Yes      | `[longitude, latitude]` (WGS84)         |
| `type`        | string   | Yes      | `"intersection"` or `"endpoint"`         |

### Field Reference — Edges

| Field        | Type   | Required | Description                               |
|--------------|--------|----------|-------------------------------------------|
| `id`         | string | Yes      | Unique edge ID                            |
| `source`     | string | Yes      | Source node ID                            |
| `target`     | string | Yes      | Target node ID                            |
| `segment_id` | string | Yes      | Links back to segmentation `segment_id`   |
| `weight`     | number | Yes      | Edge weight (length in meters)            |
| `road_label` | string | Yes      | Condition from classification             |

---

## Job Status Updates

The model must update the `jobs` table as it progresses:

```sql
-- When starting segmentation
UPDATE jobs SET status = 'running', progress = 0, started_at = NOW() WHERE id = '<job_id>';

-- During segmentation (0-33%)
UPDATE jobs SET progress = 20 WHERE id = '<job_id>';

-- Segmentation complete, starting classification (33-66%)
UPDATE jobs SET progress = 33 WHERE id = '<job_id>';

-- Classification complete, starting connectivity (66-100%)
UPDATE jobs SET progress = 66 WHERE id = '<job_id>';

-- All stages complete
UPDATE jobs SET status = 'completed', progress = 100, completed_at = NOW() WHERE id = '<job_id>';

-- On failure at any stage
UPDATE jobs SET status = 'failed', error_message = 'Description of error' WHERE id = '<job_id>';
```

## Coordinate System

All coordinates use **WGS84 (EPSG:4326)**: `[longitude, latitude]`.
This is the GeoJSON standard and what Leaflet/OSM expects.

---

## Summary for Model Team

1. Read the GeoJSON file from Supabase Storage at the path in `geojson_uploads.file_path`
2. Process in 3 stages, updating `jobs.progress` as you go
3. Write segmentation output as a FeatureCollection of LineStrings
4. Write classification output as individual rows (one per segment)
5. Write connectivity output as a node/edge adjacency list with metrics
6. Set `jobs.status = 'completed'` when done, or `'failed'` with `error_message` on error
