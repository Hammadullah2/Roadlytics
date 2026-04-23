# Data Flow: GeoJSON Upload → Model → Map Display

## Complete Flow Diagram

```
┌─────────┐         ┌──────────┐         ┌─────────────────┐        ┌───────────┐
│  User   │         │ Frontend │         │  Go Backend     │        │  Supabase │
│(Browser)│         │ (Next.js)│         │  (Goroutines)   │        │  (Cloud)  │
└────┬────┘         └────┬─────┘         └───────┬─────────┘        └─────┬─────┘
     │                   │                       │                        │
     │  1. Upload .geojson file                  │                        │
     │──────────────────▶│                       │                        │
     │                   │  2. POST /regions/:id/geojson                  │
     │                   │──────────────────────▶│                        │
     │                   │                       │  3. Store file         │
     │                   │                       │───────────────────────▶│
     │                   │                       │      Supabase Storage  │
     │                   │                       │                        │
     │                   │                       │  4. Insert record      │
     │                   │                       │───────────────────────▶│
     │                   │                       │   geojson_uploads tbl  │
     │                   │                       │                        │
     │                   │  5. POST /regions/:id/jobs (type=segmentation) │
     │                   │──────────────────────▶│                        │
     │                   │                       │  6. Insert job         │
     │                   │                       │  (status=pending)      │
     │                   │                       │───────────────────────▶│
     │                   │                       │                        │
     │                   │                       │                        │
     │                   │          ┌─────────────────────────┐           │
     │                   │          │ ModelDispatcher goroutine│          │
     │                   │          │ (polls pending jobs)     │          │
     │                   │          └────────────┬────────────┘           │
     │                   │                       │                        │
     │                   │                       │  7. Update job         │
     │                   │                       │  (status=running)      │
     │                   │                       │───────────────────────▶│
     │                   │                       │                        │
     │                   │                       │                        │
     │                   │                       │         ┌──────────────┤
     │                   │                       │         │  AI Model    │
     │                   │                       │         │ (External)   │
     │                   │                       │         │              │
     │                   │                       │         │ 8. Reads     │
     │                   │                       │         │ GeoJSON from │
     │                   │                       │         │ Storage      │
     │                   │                       │         │              │
     │                   │                       │         │ 9. Processes │
     │                   │                       │         │ (segment,    │
     │                   │                       │         │  classify,   │
     │                   │                       │         │  graph)      │
     │                   │                       │         │              │
     │                   │                       │         │ 10. Writes   │
     │                   │                       │         │ results to   │
     │                   │                       │         │ Supabase DB  │
     │                   │                       │         └──────┬───────┘
     │                   │                       │                │
     │                   │          ┌─────────────────────────┐   │
     │                   │          │ ProgressPoller goroutine │  │
     │                   │          │ (every 1 minute)         │  │
     │                   │          └────────────┬────────────┘   │
     │                   │                       │                │
     │                   │                       │  11. Read job  │
     │                   │                       │  progress      │
     │                   │                       │◀───────────────│
     │                   │                       │                │
     │                   │          ┌─────────────────────────┐   │
     │                   │          │ UIPushService goroutine  │  │
     │                   │          └────────────┬────────────┘   │
     │                   │                       │                │
     │                   │  12. WebSocket push    │                │
     │                   │  (progress update)     │                │
     │                   │◀──────────────────────│                │
     │  13. Progress bar │                       │                │
     │◀─────────────────│                       │                │
     │                   │                       │                │
     │                   │          ┌─────────────────────────┐   │
     │                   │          │ JobListener goroutine    │  │
     │                   │          │ (detects completion)     │  │
     │                   │          └────────────┬────────────┘   │
     │                   │                       │                │
     │                   │          ┌─────────────────────────┐   │
     │                   │          │ ResultParser goroutine   │  │
     │                   │          │ (validates GeoJSON)      │  │
     │                   │          └────────────┬────────────┘   │
     │                   │                       │                │
     │                   │          ┌─────────────────────────┐   │
     │                   │          │ StateSwitcher + Alerter  │  │
     │                   │          └────────────┬────────────┘   │
     │                   │                       │                │
     │                   │  14. WebSocket push    │                │
     │                   │  ("Job Completed")     │                │
     │                   │◀──────────────────────│                │
     │  15. Toast alert  │                       │                │
     │◀─────────────────│                       │                │
     │                   │                       │                │
     │  16. View on Map  │  17. GET /regions/:id/results          │
     │──────────────────▶│──────────────────────▶│                │
     │                   │                       │  18. Query     │
     │                   │                       │───────────────▶│
     │                   │                       │◀───────────────│
     │                   │  19. GeoJSON response  │                │
     │                   │◀──────────────────────│                │
     │  20. Map renders  │                       │                │
     │  GeoJSON layers   │                       │                │
     │◀─────────────────│                       │                │
     │                   │                       │                │
```

## Data Stored at Each Stage

### Supabase Storage (Files)
- `geojson-uploads/{region_id}/{filename}.geojson` — User's raw upload
- `satellite-images/{region_id}/{filename}.tif` — Satellite imagery
- `reports/{job_id}/{report_name}.pdf` — Generated reports

### Supabase Database (Records)

| Stage              | Table                    | Key Data                           |
|--------------------|--------------------------|------------------------------------|
| Upload             | geojson_uploads          | file_path, uploaded_by, region_id  |
| Job Created        | jobs                     | status=pending, job_type, region_id|
| Model Processing   | jobs                     | status=running, progress 0-100     |
| Segmentation Done  | segmentation_results     | geojson_data (FeatureCollection)   |
| Classification Done| classification_results   | road_label, confidence, geometry   |
| Connectivity Done  | connectivity_graphs      | graph_data, metrics                |
| Job Complete       | jobs                     | status=completed                   |
| Report Generated   | reports                  | file_path, report_type             |

## Model ↔ Supabase Interaction

The AI model is a separate service that interacts with Supabase directly:

```
Model reads from:
  - Supabase Storage: GeoJSON files, satellite images
  - Supabase DB: jobs table (to find pending work)

Model writes to:
  - Supabase DB: segmentation_results, classification_results,
                  connectivity_graphs, jobs (status updates)
```

The Go backend's goroutines monitor the DB for changes and push
updates to connected WebSocket clients.
