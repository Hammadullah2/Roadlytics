# Roadlytics Deployment Notes

Use [deploy/azure/README.md](/C:/Users/hammad/Roadlytics/deploy/azure/README.md) as the main production guide for the Azure VM path.

## Docker services

- `backend`: FastAPI API, background worker, tiling, reports, and pipeline execution
- `frontend`: static Next.js export served by nginx

## Local or VM startup with Docker

```bash
docker compose build
docker compose up -d
```

Frontend:

- `http://localhost:3000`

Backend:

- `http://localhost:8000/api/health`

## Mounted runtime assets

- `./model_weights` -> `/app/model_weights`
- `./data/osm_roads` -> `/app/data/osm_roads`
- `./backend/data` -> `/app/backend/data`

## Basemap

The frontend defaults to the standard OpenStreetMap raster basemap and keeps the
tile URL configurable through:

- `NEXT_PUBLIC_BASEMAP_TILE_URL`
- `NEXT_PUBLIC_BASEMAP_ATTRIBUTION`

## PakOSM data

Place the Pakistan OSM roads shapefile set in `data/osm_roads/` using the filename stem:

- `gis_osm_roads_free_1.shp`
- matching `.shx`, `.dbf`, `.prj`, `.cpg`

## Azure shape

- Frontend can stay containerized or move to Azure Blob static website hosting
- Backend container should run on an Azure Ubuntu VM first
- Azure Blob remains the recommended artifact/upload store
- SQLite remains acceptable for the first deployment on a single VM

## Production commands

```bash
cp deploy/azure/.env.vm.example deploy/azure/.env.vm
bash deploy/azure/deploy.sh
```
