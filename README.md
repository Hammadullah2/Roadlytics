# Roadlytics — Road Quality Assessment Platform

An end-to-end road quality assessment system. A user uploads a GeoTIFF, the Python inference server segments and classifies road pixels, and results are stored in Supabase and surfaced through a React dashboard backed by a Go API.

---

## Architecture Overview

```text
                  ┌─────────────────────────────────────┐
                  │              VERCEL                  │
USER ────────────►│  React Frontend (Vite/TypeScript)    │
  (uploads GeoTIF)│  Go Backend API (serverless)         │
                  └──────────┬──────────────────────────┘
                             │  multipart POST (GeoTIFF + model config)
                             ▼
                  ┌─────────────────────────────────────┐
                  │         VPS  (Docker)                │
                  │  FastAPI Inference Server            │
                  │  Celery Worker + Redis               │
                  │  nginx + TLS                         │
                  └──────────┬──────────────────────────┘
                             │  writes directly via service-role key
                             ▼
                  ┌─────────────────────────────────────┐
                  │           SUPABASE                   │
                  │  PostgreSQL · Storage · Auth         │
                  │  Realtime (job progress → frontend)  │
                  └─────────────────────────────────────┘
```

| Service | Tech | Hosted on |
|---|---|---|
| Frontend | React 18 · Vite 5 · TypeScript | Vercel (static) |
| Backend API | Go 1.25 · chi | Vercel (serverless) |
| Inference server | FastAPI · Celery · Python 3.11 | VPS (Docker) |
| Task broker | Redis 7 | VPS (Docker) |
| Database / Auth / Storage | Supabase | Supabase cloud |

**Input format:** users upload a GeoTIFF directly — no SentinelHub or AOI polygon drawing required. The backend forwards the raw bytes to the inference server as a multipart form.

**Job progress flow:** the inference server writes progress directly to the Supabase `jobs` table. The frontend subscribes to row changes via Supabase Realtime — no WebSocket connection to the backend is required.

**Frontend layout:** all routes render inside a shared `AppShell` (sidebar + topbar). The Map Analysis route breaks out of the content padding to fill the full viewport.

---

## User flow

1. **New Project** — drag-drop a GeoTIFF, give the project a name, choose segmentation and classification models, submit.
2. **Processing** — the pipeline monitor shows five stages: Data Ingest → Road Segmentation → Condition Classification → Network Analysis → Report Generation. Progress is pushed via Supabase Realtime.
3. **Map Analysis** — full-viewport Leaflet map with a floating right panel for toggling and adjusting opacity of raster overlays (seg mask, combined, good/damaged/unpaved, connectivity map). Network metrics are shown in the same panel.

---

## Pipeline model options

Two model choices per stage can be selected from the UI and are forwarded to the inference server:

| Stage | `seg_model` values | Description |
|---|---|---|
| Segmentation | `osm` (default) | Binary road mask derived from OpenStreetMap tiles |
| Segmentation | `deeplabv3` | Deep neural segmentation (requires weights) |

| Stage | `clf_model` values | Description |
|---|---|---|
| Classification | `kmeans` (default) | Unsupervised K-Means clustering |
| Classification | `efficientnet` | EfficientNet classifier (requires weights) |

Both values are passed as form fields (`seg_model`, `clf_model`) from the frontend → Go handler → dispatcher → inference server multipart form → `run_on_tif()`.

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Git | any | — |
| Docker + Compose v2 | 24+ | for the VPS inference server |
| Go | 1.25 | only for local backend dev |
| Node.js | 20 | only for local frontend dev |
| Python | 3.11 | only for local inference dev |
| Supabase account | — | free tier works |
| Vercel account | — | free Hobby tier works for backend + frontend |

---

## 1 — Clone the repository

```bash
git clone https://github.com/Hammadullah2/Roadlytics.git
cd Roadlytics
```

---

## 2 — Obtain model weights

The model weight files are too large for GitHub. Email to request them:

**hammad23bh@gmail.com**

Once you receive the files, place them here:

```
Roadlytics/
└── weights/
    ├── road segmentation.pth      # DeepLabV3 segmentation model (~192 MB)
    └── road_condition_model.pth   # EfficientNet classification model (~30 MB)
```

The inference server will not start without these files when `deeplabv3` or `efficientnet` models are used. The `osm` + `kmeans` combination works without the weight files.

---

## 3 — Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the migration files **in order**:
   - `database/schemas/001_initial_schema.sql`
   - `database/schemas/002_supabase_setup.sql`
   - `database/schemas/003_rls_policies.sql`
   - `database/schemas/004_storage_policies.sql`
   - `database/schemas/005_auth_triggers.sql`
   - `database/schemas/006_realtime.sql`
   - `database/schemas/007_admin_settings.sql`
3. Go to **Storage** and create two buckets (both private):
   - `reports` — PDF and ZIP reports
   - `inference-outputs` — GeoTIFF overlays, GeoJSON, and shapefiles produced by the VPS

---

## 4 — Generate the shared secret

The backend and inference server authenticate their internal callback with a shared secret. Generate one now and keep it — you will paste it into both Vercel and the VPS `.env`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 5 — Deploy the inference server on a VPS

The inference server must run on a machine that can hold GPU-sized model weights and run long-lived Celery workers. Vercel serverless functions are not suitable for this workload.

### 5.1 — Provision a server

| Provider | Recommended spec |
|---|---|
| AWS EC2 | `g4dn.xlarge` (NVIDIA T4) for GPU; `t3.large` for CPU-only |
| DigitalOcean | 8 GB GPU Droplet or 4 GB CPU Droplet |
| Hetzner | CX31 (CPU) or GX42 (GPU) |

Set `INFERENCE_DEVICE=cuda` when a compatible NVIDIA GPU is present; `cpu` otherwise.

### 5.2 — Install Docker

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in
```

### 5.3 — Copy files to the server

Only the inference server code and model weights are needed on the VPS. Everything else runs on Vercel.

```bash
# From your local machine
scp -r inference_server_project/ user@YOUR_VPS_IP:~/roadlytics/
scp -r weights/                  user@YOUR_VPS_IP:~/roadlytics/
```

### 5.4 — Configure the VPS environment

```bash
# On the VPS
cd ~/roadlytics/inference_server_project
cp .env.vps.example .env
nano .env   # fill in all values
```

Required values in `.env`:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (bypasses RLS to write progress) |
| `STORAGE_BUCKET_OUTPUTS` | `inference-outputs` (bucket created in step 3) |
| `STORAGE_BUCKET_REPORTS` | `reports` (bucket created in step 3) |
| `BACKEND_CALLBACK_URL` | Your Vercel backend URL, e.g. `https://roadlytics-api.vercel.app` |
| `INTERNAL_SECRET` | Shared secret generated in step 4 |
| `INFERENCE_DEVICE` | `cpu` or `cuda` |

### 5.5 — Configure nginx TLS

Edit `inference_server_project/nginx.conf` and replace every `YOUR_DOMAIN` with your actual domain (e.g. `inference.yourdomain.com`). Then obtain a certificate:

```bash
sudo apt install certbot -y
sudo certbot certonly --standalone -d inference.yourdomain.com
```

### 5.6 — Start the inference stack

```bash
cd ~/roadlytics/inference_server_project
docker compose -f docker-compose.vps.yml up --build -d
```

This starts four containers: `inference-redis`, `inference-server`, `inference-worker`, and `inference-nginx`.

Verify it is running:

```bash
curl https://inference.yourdomain.com/api/health
# → {"status":"ok","device":"cuda"}
```

### Useful VPS commands

```bash
# View logs
docker compose -f docker-compose.vps.yml logs -f inference
docker compose -f docker-compose.vps.yml logs -f inference-worker

# Restart after a code change
docker compose -f docker-compose.vps.yml up --build -d inference inference-worker

# Full reset
docker compose -f docker-compose.vps.yml down -v
```

---

## 6 — Deploy the backend on Vercel

### 6.1 — Install the Vercel CLI

```bash
npm i -g vercel
```

### 6.2 — Deploy

```bash
cd backend
vercel deploy --prod
```

Vercel detects `backend/vercel.json` and builds the Go serverless function automatically. Note the deployment URL (e.g. `https://roadlytics-api.vercel.app`).

### 6.3 — Set environment variables

In the [Vercel dashboard](https://vercel.com) → your backend project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase connection string (Transaction mode) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `INTERNAL_SECRET` | Shared secret generated in step 4 |
| `INFERENCE_SERVER_URL` | `https://inference.yourdomain.com` |
| `FRONTEND_URL` | Your Vercel frontend URL (added after step 7) |
| `PORT` | `8080` |
| `SERVER_ENV` | `production` |
| `STORAGE_BUCKET_REPORTS` | `reports` |

After adding variables, trigger a redeploy:

```bash
vercel deploy --prod
```

---

## 7 — Deploy the frontend on Vercel

### 7.1 — Deploy

```bash
cd frontend
vercel deploy --prod
```

Vercel detects `frontend/vercel.json` (framework: Vite) and builds the static site. Note the deployment URL.

### 7.2 — Set environment variables

In the Vercel dashboard → your **frontend** project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | `https://roadlytics-api.vercel.app/api/v1` |

After adding variables, trigger a redeploy:

```bash
vercel deploy --prod
```

### 7.3 — Update FRONTEND_URL on the backend

Go back to the **backend** Vercel project → **Settings → Environment Variables** and set:

```
FRONTEND_URL = https://your-frontend.vercel.app
```

Redeploy the backend once more:

```bash
cd backend
vercel deploy --prod
```

---

## 8 — Verify the full stack

```bash
# 1. Inference server health (VPS)
curl https://inference.yourdomain.com/api/health

# 2. Backend API health (Vercel)
curl https://roadlytics-api.vercel.app/api/v1/health

# 3. Open the frontend in a browser
open https://your-frontend.vercel.app
```

Log in, create a project, upload a GeoTIFF, choose models, and submit. The job row should update in real time via Supabase Realtime as the inference server processes it on the VPS. When complete, open the Map Analysis view to inspect raster overlays.

---

## 9 — Local development (without Docker)

For full local development all three services run on your machine.

### Backend (Go)

```bash
cp .env.example .env   # fill in values
cd backend
go mod download
go run ./cmd/server
# → http://localhost:8080
```

### Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Inference server (Python / FastAPI)

```bash
cd inference_server_project
pip install -r requirements.txt

# Redis must be running
docker run -d -p 6379:6379 redis:7-alpine

# Set env vars
export REDIS_URL=redis://localhost:6379/0
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export BACKEND_CALLBACK_URL=http://localhost:8080
export INTERNAL_SECRET=...
export INFERENCE_DEVICE=cpu

# Start the API server
uvicorn inference_server.api:app --host 0.0.0.0 --port 8000 --reload

# In a second terminal — start the Celery worker
celery -A inference_server.api:celery_app worker --loglevel=info --concurrency=1
```

### Local end-to-end with Docker

The root `docker-compose.yml` runs the inference stack locally (no backend or frontend containers — those run natively):

```bash
cp .env.example .env   # fill in values; set BACKEND_CALLBACK_URL=http://host.docker.internal:8080
docker compose up --build
```

---

## 10 — Database schema migrations

Whenever you pull new changes that include new SQL files in `database/schemas/`, run them in the Supabase SQL Editor in ascending numerical order.

---

## Project structure

```
Roadlytics/
├── backend/                        Go API (chi router · Supabase · no WebSocket)
│   ├── api/index.go                Vercel serverless entry point
│   ├── cmd/server/main.go          Standalone binary entry point (local dev)
│   ├── internal/dispatch/          Synchronous job dispatch to inference server
│   ├── internal/modelclient/       HTTP client for inference server (seg_model, clf_model)
│   └── vercel.json                 Vercel build config
├── frontend/                       React 18 + Vite 5 + TypeScript
│   ├── src/
│   │   ├── styles/
│   │   │   ├── variables.css       Design-system tokens (warm beige/terra palette)
│   │   │   └── index.css           Utility classes (.card, .btn, .pill, .table, …)
│   │   ├── components/
│   │   │   ├── layout/             AppShell (sidebar + topbar — shared by all routes)
│   │   │   ├── auth/               LoginPage, AdminLoginPage, AuthShell, ApprovalGuard
│   │   │   ├── dashboard/          DashboardPage
│   │   │   ├── projects/           ProjectsPage, ProjectDetailPage, ProjectCard
│   │   │   ├── upload/             UploadPage (GeoTIFF drag-drop + PipelineConfigModal)
│   │   │   ├── processing/         ProcessingPage (pipeline stage monitor + active jobs)
│   │   │   ├── reports/            ReportsPage (searchable table + pagination)
│   │   │   ├── map-analysis/       MapAnalysisPage (full-viewport map + floating layer panel)
│   │   │   ├── map/                AssessmentMap (Leaflet + TIF raster overlays)
│   │   │   └── admin/              AdminPage
│   │   ├── hooks/                  useJobRealtime, useProjects, useJobRecords, …
│   │   ├── store/                  Zustand stores (authStore, jobStore)
│   │   └── lib/                    supabaseClient, apiClient
│   └── vercel.json                 Vercel build config (SPA rewrites)
├── inference_server_project/       FastAPI + Celery inference server
│   ├── inference_server/
│   │   ├── api.py                  FastAPI app + Celery tasks (accepts seg_model, clf_model)
│   │   ├── pipeline.py             InferencePipeline orchestrator
│   │   ├── supabase_bridge.py      Writes progress to Supabase, uploads outputs
│   │   └── config.py               Settings (Supabase, Redis, output dir, device)
│   ├── docker-compose.vps.yml      VPS deployment (redis + inference + worker + nginx)
│   ├── nginx.conf                  nginx reverse proxy with TLS
│   └── .env.vps.example            VPS environment template
├── road_pipeline/                  Python ML pipeline package
│   ├── segmentation/               DeepLabV3 (deeplabv3) + OSM mask (osm)
│   ├── classification/             EfficientNet (efficientnet) + K-Means (kmeans)
│   └── postprocess/                Raster → vector → GeoJSON / shapefiles
├── database/schemas/               SQL migrations 001–007
├── notebooks/                      Google Colab training & inference scripts
├── weights/                        Model weights (not in git — see step 2)
├── docker-compose.yml              Local dev: inference stack only
├── .env.example                    Root environment template
└── README.md
```

---

## Contact

For model weights or questions: **hammad23bh@gmail.com**
