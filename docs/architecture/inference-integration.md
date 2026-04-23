# Inference Server Integration

The Python inference server (`proper fyp/inference_server_project/`) and this Go
backend are **two independent services**. Neither owns the other's lifecycle,
filesystem, database, or secrets. They communicate over HTTP + WebSocket only.

This doc documents the contract and the independence guarantees.

---

## 1. Independence contract

| Concern | Backend | Inference server |
|---|---|---|
| Code repository | this repo | `proper fyp/inference_server_project` |
| Runtime | Go 1.22+ | Python 3.11 + Celery + Redis |
| Persistent storage | Supabase Postgres | Local filesystem + Redis |
| Secrets | Supabase / JWT / internal callback | SentinelHub client id/secret |
| Port | `$PORT` (default 8080) | 8000 |
| GPU requirement | No | Yes (preferred) for model inference |
| Can be restarted independently | **Yes** | **Yes** |
| Can be scaled independently | **Yes** | **Yes** |

Neither service:
- shares a filesystem with the other (outputs are exchanged via HTTP proxy)
- shares a database with the other (each keeps its own state)
- requires the other to be reachable at startup
- hardcodes the other's hostname or port

The only coupling is the **URL** of the inference server, supplied to the
backend via `INFERENCE_SERVER_URL`. Everything else flows through that URL.

---

## 2. Wire protocol

```
Frontend                 Go Backend                          Python Inference Server
────────                 ──────────                          ──────────────────────
                          │                                     │
POST /api/v1/jobs ──────▶ │                                     │
  region_id, dates,       │                                     │
  max_cloud_cover         │  stores params in result_refs       │
                          │  dispatcher picks up job            │
                          │                                     │
                          ├─ POST /api/jobs/fetch-and-run ─────▶│
                          │    aoi_bbox, dates, region_name,    │
                          │    max_cloud_cover, resolution_m    │
                          │                                     │  Celery task queued
                          │◀── 200 { job_id, websocket_url } ───┤
                          │    (stored as inference_job_id)     │
                          │                                     │
                          ├─ WS /ws/jobs/{inference_job_id} ───▶│  Redis pub/sub
                          │                                     │
                          │◀── progress_update { stage, pct } ──┤
                          │  relayed to frontend via our WS hub │
                          │                                     │
                          │◀── job_completed { outputs, stats } ┤
                          │  persisted in result_refs           │
                          │                                     │
GET /api/v1/jobs/{id}/    │                                     │
    layers/roads-geojson ▶│                                     │
                          ├─ GET /api/jobs/                     │
                          │    {inf_id}/download/graph_geojson ▶│
                          │◀──── FeatureCollection bytes ───────┤
                          │◀──── streamed to frontend           │
```

Notes:
- The backend never touches the inference server's filesystem. File outputs are
  proxied on-demand through `GET /api/jobs/{id}/download/{file_key}`.
- The frontend never talks directly to the inference server. All traffic goes
  through the backend so auth, CORS, and origin policy stay in one place.
- `WSBaseURL()` converts the configured `http://` base to `ws://` (or https→wss)
  automatically.

---

## 3. Resilience

### Control-plane calls (`fetch-and-run`, `/api/health`, status)
- Timeout: 30 s (configurable via `modelclient.Options.HTTPTimeout`)
- `fetch-and-run` retries transient errors (network errors, 5xx) up to 3 times
  with exponential backoff (500 ms → 1 s → 2 s). 4xx responses are returned
  immediately.

### Downloads (`/api/jobs/{id}/download/{file_key}`)
- Timeout: 5 min (configurable via `modelclient.Options.DownloadTimeout`)
- Large files (PDFs, GeoJSONs, zipped shapefiles) can exceed the control-plane
  budget, so downloads use a separate HTTP client.

### WebSocket stream (`/ws/jobs/{inference_job_id}`)
- Dial timeout: 10 s
- **Reconnects on drop** with exponential backoff (2 s → 4 s → ... capped at
  60 s), up to 10 attempts. If the inference server is restarted mid-job the
  watcher reconnects and resumes streaming updates.
- Stops reconnecting on terminal job state (`job_completed` / `job_failed`),
  parent context cancellation, or exhausted attempts.
- If attempts are exhausted, the backend marks the job failed rather than
  silently orphaning it.

### Startup probe
- Backend issues a single non-blocking `GET /api/health` probe against the
  inference server at startup. Result is logged at `INFO` (reachable) or `WARN`
  (unreachable). **Backend startup never blocks on this.** Jobs created while
  the inference server is unreachable will fail on dispatch, then the next
  dispatch attempt will succeed once the inference server is back.

### Health endpoint (`GET /api/v1/health`)
- Reports `inference_server: connected | disconnected` alongside database,
  Supabase, storage, WebSocket hub, and orchestrator statuses.
- Inference server being `disconnected` yields overall `degraded`, **not**
  `error`. The backend remains operational (UI login, history, reports already
  downloaded) even when the inference server is down.

---

## 4. Deployment recipes

### Local dev (two processes)
```bash
# Terminal 1 — inference server
cd proper\ fyp/inference_server_project
python run_server.py            # → http://localhost:8000
celery -A inference_server.api:celery_app worker --loglevel=info --concurrency=1

# Terminal 2 — backend
cd road-quality-assessment/backend
INFERENCE_SERVER_URL=http://localhost:8000 go run ./cmd/server
```

### Docker Compose (two services, same host)
```yaml
services:
  inference:
    build: ./proper_fyp/inference_server_project
    ports: ["8000:8000"]
    environment:
      - SH_CLIENT_ID=${SH_CLIENT_ID}
      - SH_CLIENT_SECRET=${SH_CLIENT_SECRET}

  backend:
    build: ./road-quality-assessment/backend
    ports: ["8080:8080"]
    environment:
      - INFERENCE_SERVER_URL=http://inference:8000  # compose DNS
      - SUPABASE_URL=${SUPABASE_URL}
      # … etc
    depends_on: []   # backend does NOT wait for inference
```

No `depends_on: [inference]` — the backend tolerates the inference server
starting later or restarting.

### Split deployment (backend on CPU cluster, inference on GPU node)
```
Backend (k8s CPU pool)            INFERENCE_SERVER_URL=https://infer.example.com
Inference (k8s GPU pool)          exposes 8000 behind ingress with TLS
```

The only network requirement is **outbound HTTP + WebSocket** from the backend
to the inference server's address. No shared volumes, no shared database.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Startup log: "inference server health probe failed" | URL wrong or server not up | check `INFERENCE_SERVER_URL`, then curl `/api/health` |
| Job stuck at "pending" forever | dispatcher can't reach inference server | check backend logs for `inference server fetch-and-run failed` |
| Job jumps to "failed" with no stage logs | all 10 WS reconnect attempts exhausted | check inference server is stable; otherwise increase `maxReconnectAttempts` in `orchestrator.watchInferenceJob` |
| Roads GeoJSON endpoint returns 503 | `INFERENCE_SERVER_URL` not set | set the env var and restart the backend |
| Roads GeoJSON endpoint returns 502 | inference server returned non-200 for download | confirm `graph_geojson` exists via `GET {inf}/api/jobs/{id}/download/graph_geojson` |
| `/api/v1/health` reports `inference_server: disconnected` but backend works | inference server briefly down — expected degraded state | no action; jobs dispatched during outage will fail and need retry |
