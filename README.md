# Roadlytics — Road Quality Assessment Platform

An end-to-end road quality assessment system. Satellite imagery is fetched, segmented, and classified by a Python inference server; results are stored in Supabase and surfaced through a React dashboard backed by a Go API.

---

## Architecture Overview

```text
React Frontend (Vite)
       │  REST + WebSocket
       ▼
Go Backend (chi router)  ──→  Supabase (PostgreSQL + Auth + Storage)
       │  internal HTTP
       ▼
FastAPI Inference Server
       │  Celery task queue
       ▼
Redis  +  road_pipeline package
           (DeepLabV3 segmentation · EfficientNet / K-Means classification)
```

| Service | Tech | Default port |
|---|---|---|
| Frontend | React 18 · Vite 5 · TypeScript | 5173 |
| Backend | Go 1.25 · chi · gorilla/websocket | 8080 |
| Inference server | FastAPI · Celery · Python 3.10 | 8000 |
| Task broker | Redis 7 | 6379 |
| Database | Supabase (managed PostgreSQL) | — |

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Git | any | — |
| Docker Desktop | 24+ | includes Docker Compose v2 |
| Go | 1.25 | only needed for local non-Docker dev |
| Node.js | 20 | only needed for local non-Docker dev |
| Python | 3.10 | only needed for local non-Docker dev |
| Supabase account | — | free tier works |

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

The inference server will not start without these files.

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
3. Go to **Storage** and create three buckets (all private):
   - `geojson-uploads`
   - `satellite-images`
   - `reports`

---

## 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in every value. The table below explains each one.

### Supabase values (from Dashboard → Settings → API / Database)

| Variable | Where to find it |
|---|---|
| `DATABASE_URL` | Settings → Database → Connection string (Transaction mode) |
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Settings → API → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role key |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Secret |

### Backend

| Variable | Value |
|---|---|
| `PORT` / `SERVER_PORT` | `8080` |
| `SERVER_ENV` | `development` or `production` |
| `FRONTEND_URL` | `http://localhost:5173` (local) or your domain |
| `INTERNAL_SECRET` | Run `python -c "import secrets; print(secrets.token_hex(32))"` and paste output |

### Frontend (embedded at build time)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080/api/v1` (local) or `https://yourdomain.com/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080/ws` (local) or `wss://yourdomain.com/ws` |
| `NEXT_PUBLIC_MAP_TILE_URL` | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |

### Inference server (optional — only needed with `--profile inference`)

| Variable | Value |
|---|---|
| `INFERENCE_SERVER_URL` | `http://inference:8000` |
| `INFERENCE_DEVICE` | `cpu` or `cuda` |
| `SH_CLIENT_ID` | SentinelHub OAuth client ID |
| `SH_CLIENT_SECRET` | SentinelHub OAuth client secret |
| `SH_INSTANCE_ID` | SentinelHub instance ID |
| `PLANET_API_KEY` | Planet Labs API key (optional fallback) |

SentinelHub credentials: [apps.sentinel-hub.com/dashboard](https://apps.sentinel-hub.com/dashboard) → OAuth clients.

---

## 5 — Run with Docker (recommended)

Docker handles all dependencies — Go, Node, Python, GDAL — inside containers.

### Option A: Frontend + Backend only (no ML inference)

```bash
docker compose up --build
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:8080/api/v1/health](http://localhost:8080/api/v1/health)

No `weights/` folder or SentinelHub credentials needed for this mode.

### Option B: Full stack including inference server

Requires `weights/` to be populated (see step 2) and SentinelHub credentials in `.env`.

```bash
docker compose --profile inference up --build
```

This starts four containers: `backend`, `frontend`, `inference` (FastAPI), `inference-worker` (Celery), and `redis`.

### Useful Docker commands

```bash
# Stop everything
docker compose --profile inference down

# View logs for a specific service
docker compose logs -f backend
docker compose logs -f inference

# Rebuild a single service after code change
docker compose --profile inference up --build inference

# Remove all containers and volumes (full reset)
docker compose --profile inference down -v
```

---

## 6 — Run locally without Docker

### Backend (Go)

```bash
cd backend
go mod download
go run ./cmd/server
```

Runs on [http://localhost:8080](http://localhost:8080).

### Frontend (React / Vite)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Runs on [http://localhost:5173](http://localhost:5173).

### Inference server (Python / FastAPI)

```bash
# Install dependencies (use a virtualenv)
cd inference_server_project
pip install -r requirements.txt

# Start the API server
uvicorn inference_server.api:app --host 0.0.0.0 --port 8000 --reload

# In a third terminal — start the Celery worker
celery -A inference_server.api:celery_app worker --loglevel=info --concurrency=1
```

Redis must be running locally (`docker run -d -p 6379:6379 redis:7-alpine`) and `REDIS_URL=redis://localhost:6379/0` set in your environment.

### Road pipeline (standalone)

The ML pipeline can be run independently for testing without the full stack:

```bash
cd "proper fyp"

# Set env var BEFORE importing the package (config.py reads it at import time)
set DRIVE_ROOT=C:\path\to\proper fyp   # Windows CMD
# export DRIVE_ROOT=/path/to/proper-fyp  # Linux/macOS

python -m road_pipeline --segmenter osm --classifier kmeans
```

Outputs (GeoTIFF masks + QGIS-ready shapefiles) are written to `road_pipeline/output/`.

For GPU-accelerated runs, use the **Google Colab script** at `notebooks/road_pipeline_colab.py` — mount your Drive at `/content/drive/MyDrive/fyp test/` and run all cells.

---

## 7 — Deploy to a VPS or AWS EC2

Docker and a cloud VM are complementary: Docker packages the app; the VM is where you run it.

### Provision a server

| Provider | Recommended spec |
|---|---|
| AWS EC2 | `t3.medium` (2 vCPU, 4 GB) for backend+frontend; `t3.large` (8 GB) for full inference stack |
| DigitalOcean | 4 GB Droplet (basic) / 8 GB for inference |
| Hetzner | CX21 (3.5 €/mo) is cost-effective for backend+frontend |

If you want GPU inference, use an AWS `g4dn.xlarge` (NVIDIA T4) or equivalent and set `INFERENCE_DEVICE=cuda`.

### Install Docker on the server

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in
docker --version
```

### Deploy the application

```bash
# On the server — clone the repo
git clone https://github.com/Hammadullah2/Roadlytics.git
cd Roadlytics

# Copy your .env (never commit the real one)
# You can scp it from your machine:
#   scp .env user@your-server-ip:~/Roadlytics/.env

# Place model weights in weights/ (scp or download from your storage)

# Start the full stack
docker compose --profile inference up --build -d
```

The `-d` flag runs everything in the background. Check logs with:

```bash
docker compose --profile inference logs -f
```

### Point a domain at the server

1. Buy a domain and add an **A record** pointing to your server's IP.
2. Install Nginx as a reverse proxy:

```bash
sudo apt install nginx certbot python3-certbot-nginx -y
```

3. Create `/etc/nginx/sites-available/roadlytics`:

```nginx
server {
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
    }
}
```

4. Enable the site and get an SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/roadlytics /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo systemctl reload nginx
```

5. Update your `.env` for production:

```env
SERVER_ENV=production
FRONTEND_URL=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
NEXT_PUBLIC_WS_URL=wss://yourdomain.com/ws
```

Rebuild the frontend container after changing `NEXT_PUBLIC_*` values:

```bash
docker compose up --build frontend -d
```

### Keep it running after reboots

```bash
# Enable Docker to start on boot
sudo systemctl enable docker

# Containers already have `restart: unless-stopped` in docker-compose.yml
# so they auto-restart after a reboot automatically
```

---

## 8 — Database schema migrations

Every time you pull new changes that include new SQL files in `database/schemas/`, run them in the Supabase SQL Editor in ascending numerical order.

---

## Project structure

```
Roadlytics/
├── backend/                  Go API (chi router, Supabase, WebSocket)
├── frontend/                 React 18 + Vite 5 + TypeScript
├── inference_server_project/ FastAPI + Celery inference server
├── road_pipeline/            Python ML pipeline package
│   ├── segmentation/         DeepLabV3 (deeplab) + OSM mask (osm)
│   ├── classification/       EfficientNet (efficientnet) + K-Means (kmeans)
│   └── postprocess/          Raster → vector → QGIS shapefiles
├── database/schemas/         SQL migrations 001–007
├── notebooks/                Google Colab training & inference scripts
├── weights/                  Model weights (not in git — see step 2)
├── data/                     OSM shapefiles + satellite TIFs (not in git)
├── docs/                     Architecture diagrams and API reference
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Contact

For model weights or questions: **hammad23bh@gmail.com**
