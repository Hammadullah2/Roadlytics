# API Endpoints (v1)

Base URL: `/api/v1`
Auth: Supabase Auth JWT token in `Authorization: Bearer <token>` header.
All endpoints except auth require an approved user (approval_status = 'approved').

## Authentication (via Supabase Auth)

Auth is handled client-side by Supabase JS SDK. The backend validates
the JWT token from Supabase in middleware. These endpoints are for
server-side profile operations only.

| Method | Endpoint              | Description                    | Auth | Approval |
|--------|-----------------------|--------------------------------|------|----------|
| GET    | /auth/profile         | Get current user's profile     | Yes  | No       |
| PATCH  | /auth/profile         | Update own profile             | Yes  | No       |

## Admin

| Method | Endpoint                      | Description                  | Auth | Role  |
|--------|-------------------------------|------------------------------|------|-------|
| GET    | /admin/users                  | List all users + status      | Yes  | Admin |
| PATCH  | /admin/users/:id/approve      | Approve a pending user       | Yes  | Admin |
| PATCH  | /admin/users/:id/reject       | Reject a pending user        | Yes  | Admin |
| GET    | /admin/jobs                   | List all jobs across users   | Yes  | Admin |
| GET    | /admin/logs                   | View system audit logs       | Yes  | Admin |

## Projects

| Method | Endpoint              | Description                    | Auth | Approval |
|--------|-----------------------|--------------------------------|------|----------|
| GET    | /projects             | List user's projects           | Yes  | Yes      |
| POST   | /projects             | Create a new project           | Yes  | Yes      |
| GET    | /projects/:id         | Get project details            | Yes  | Yes      |
| PATCH  | /projects/:id         | Update project                 | Yes  | Yes      |
| DELETE | /projects/:id         | Delete project and children    | Yes  | Yes      |

## Regions

| Method | Endpoint                        | Description                   | Auth | Approval |
|--------|---------------------------------|-------------------------------|------|----------|
| GET    | /projects/:id/regions           | List regions in a project     | Yes  | Yes      |
| POST   | /projects/:id/regions           | Create region (GeoJSON AOI)   | Yes  | Yes      |
| GET    | /regions/:id                    | Get region details            | Yes  | Yes      |
| DELETE | /regions/:id                    | Delete region                 | Yes  | Yes      |

## GeoJSON Uploads

| Method | Endpoint                        | Description                       | Auth | Approval |
|--------|---------------------------------|-----------------------------------|------|----------|
| POST   | /regions/:id/geojson            | Upload GeoJSON file               | Yes  | Yes      |
| GET    | /regions/:id/geojson            | List GeoJSON uploads for region   | Yes  | Yes      |
| GET    | /geojson/:id/download           | Download a GeoJSON file           | Yes  | Yes      |

## Images (Satellite Imagery)

| Method | Endpoint                        | Description                   | Auth | Approval |
|--------|---------------------------------|-------------------------------|------|----------|
| POST   | /regions/:id/images             | Upload satellite imagery      | Yes  | Yes      |
| GET    | /regions/:id/images             | List images for a region      | Yes  | Yes      |

## Satellite Tiles (Planet Proxy)

Tile requests are proxied through the backend to keep the Planet API key server-side.
No JWT required — Leaflet cannot attach custom headers to tile requests.
The scene ID comes from `result_refs.scene_id` on the job object after dispatch.

| Method | Endpoint                                | Description                                   | Auth |
|--------|-----------------------------------------|-----------------------------------------------|------|
| GET    | /satellite/tiles/:scene_id/:z/:x/:y     | Proxy a Sentinel-2 PNG tile from Planet CDN   | No   |

Returns `200 image/png` with `Cache-Control: public, max-age=86400`. `:scene_id` is the
Planet `Sentinel2L2A` item ID. Responds `503` when `PLANET_API_KEY` is not configured.

## Jobs

| Method | Endpoint                        | Description                   | Auth | Approval |
|--------|---------------------------------|-------------------------------|------|----------|
| POST   | /regions/:id/jobs               | Create processing job         | Yes  | Yes      |
| GET    | /jobs                           | List user's jobs              | Yes  | Yes      |
| GET    | /jobs/:id                       | Get job status and progress   | Yes  | Yes      |
| DELETE | /jobs/:id                       | Cancel/delete a job           | Yes  | Yes      |

## Results (GeoJSON Data from Model)

| Method | Endpoint                        | Description                        | Auth | Approval |
|--------|---------------------------------|------------------------------------|------|----------|
| GET    | /jobs/:id/segmentation          | Get segmentation result GeoJSON    | Yes  | Yes      |
| GET    | /jobs/:id/classification        | Get classification results         | Yes  | Yes      |
| GET    | /jobs/:id/connectivity          | Get connectivity graph + metrics   | Yes  | Yes      |
| GET    | /regions/:id/results            | Get combined GeoJSON for map       | Yes  | Yes      |

## Reports

| Method | Endpoint                        | Description                   | Auth | Approval |
|--------|---------------------------------|-------------------------------|------|----------|
| GET    | /reports                        | List user's reports           | Yes  | Yes      |
| POST   | /jobs/:id/reports               | Generate report — body: `{"report_type":"pdf"}` | Yes  | Yes      |
| GET    | /reports/:id/download           | Download report file          | Yes  | Yes      |

## WebSocket

| Endpoint    | Description                                                   |
|-------------|---------------------------------------------------------------|
| /ws         | Real-time job progress + completion notifications (JWT auth)  |

## Internal (Model ↔ Backend)

The model interacts directly with Supabase DB and Storage.
These endpoints exist as an optional webhook alternative:

| Method | Endpoint                        | Description                        |
|--------|---------------------------------|------------------------------------|
| POST   | /internal/model/callback        | Model posts completion signal      |
