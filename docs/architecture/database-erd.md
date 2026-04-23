# Database Entity Relationship Diagram

## Relationships

```
users ─────────┬──────────── projects
               │                 │
               │                 │ 1:N
               │                 ▼
               │             regions
               │                 │
               │         ┌───────┼───────┐
               │         │       │       │
               │         ▼       ▼       ▼
               │      images   jobs   (geojson data)
               │                 │
               │         ┌───────┼────────────┐
               │         ▼       ▼            ▼
               │   segmentation  connectivity  reports
               │   _results      _graphs
               │         │
               │         ▼
               │   classification
               │   _results
               │
               └──────── logs
```

## Table Relationships

| Parent            | Child                  | Relationship | FK Column        |
|-------------------|------------------------|--------------|------------------|
| users             | projects               | 1:N          | owner_id         |
| projects          | regions                | 1:N          | project_id       |
| regions           | images                 | 1:N          | region_id        |
| regions           | jobs                   | 1:N          | region_id        |
| jobs              | segmentation_results   | 1:1          | job_id           |
| jobs              | connectivity_graphs    | 1:1          | job_id           |
| jobs              | reports                | 1:N          | job_id           |
| segmentation_results | classification_results | 1:N       | segmentation_id  |
| users             | images                 | 1:N          | uploaded_by      |

## Key Design Decisions

1. **UUID primary keys** - Compatible with Supabase, no sequential leak
2. **JSONB for GeoJSON** - Native PostgreSQL support, indexable
3. **Separate result tables** - Each pipeline stage stores independently
4. **Cascading deletes** - Removing a project cleans up all children
5. **PostGIS extension** - Available for spatial queries if needed later
