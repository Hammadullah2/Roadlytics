# Roadlytics Frontend

Next.js App Router frontend for the Phase 1 Roadlytics web application.

## Screens

- `Dashboard`
- `Projects`
- `Processing`
- `Map Analysis`
- `Reports`

## Runtime contract

The frontend expects a running backend that exposes the FastAPI endpoints under:

- `/api/uploads/init`
- `/api/jobs`
- `/api/jobs/{id}`
- `/api/jobs/{id}/artifacts`
- `/api/jobs/{id}/analytics`
- `/api/jobs/{id}/report`
- `/api/jobs/{id}/layers/{layer}/tilejson.json`

## Environment

Set `NEXT_PUBLIC_API_BASE_URL` so the static frontend can call the backend API:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Run locally

From `frontend/`:

```bash
npm install
npm run dev
```

## Build for static hosting

```bash
npm run build
```

The build is configured with `output: "export"` so it can be deployed to Azure Blob static website hosting.

## Docker

From the repo root:

```bash
docker compose build frontend
docker compose up -d frontend
```
