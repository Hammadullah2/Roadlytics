# Docker Deployment Guide

A linear, copy-paste walkthrough to get the Road Quality Assessment platform running in Docker — from a fresh clone to an accessible UI. Each step ends with a **Verify** command so you know it worked before moving on.

---

## 1. What you're deploying

Three logical services:

| Service       | Tech              | Port (host → container) | Notes                                |
| ------------- | ----------------- | ----------------------- | ------------------------------------ |
| **backend**   | Go 1.25           | `8080 → 8080`           | Always required.                     |
| **frontend**  | React + nginx     | `5173 → 80`             | Always required. Env vars baked in at build time. |
| **inference** | Python + FastAPI  | `8000 → 8000`           | Optional. Compose profile `inference` (also starts `redis` + `inference-worker`). |

**Supabase (Postgres + Auth + Storage) is external / cloud-hosted** — you do **not** run it in Docker. Backend and inference talk over HTTP/WebSocket only; no shared filesystem, no shared DB.

```
Browser ─▶ frontend:5173 ─▶ backend:8080 ─▶ inference:8000 (optional)
               │                │                │
               └──────▶ Supabase Cloud ◀─────────┘
                        (Auth + Postgres + Storage)
```

---

## 2. Prerequisites

- **Docker Desktop** (Windows/Mac) or **Docker Engine + Compose v2** (Linux).
- A **Supabase project** (free tier works). You'll copy: project URL, anon key, service-role key, JWT secret, DB password.
- *(Optional, for inference)* The `./model/` directory containing `inference_server_project/` and `weights/`, plus a **Planet API key** (for Sentinel-2 imagery). If you don't have these, skip inference — the backend boots in `degraded` mode, the UI still works, and the map analysis page will attempt to show a Planet satellite tile overlay for any dispatched job (requires `PLANET_API_KEY` even without inference).

---

## 3. Step 1 — Prepare Supabase (one-time)

1. Create a project at [supabase.com](https://supabase.com).
2. **Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` key
   - JWT Secret
3. **Settings → Database → Connection string (URI)**, copy it and replace `[YOUR-PASSWORD]` with your actual DB password. URL-encode special characters in the password.
4. **Storage** → create **five private buckets** (order doesn't matter, but all must exist *before* running the storage-policy migration):
   - `satellite-images`
   - `segmentation-masks`
   - `reports`
   - `connectivity-graphs`
   - `geojson-uploads`
5. **Run the database migrations** — see §3a below.

**Verify:** buckets visible in the Storage page; `profiles`, `projects`, `jobs` tables visible under Table Editor.

---

## 3a. Database setup — run migrations (first-time, in order)

The repo ships seven migration files in `database/schemas/`. Run them **in numeric order** — each depends on the previous ones.

| # | File                          | What it does                                                       |
| - | ----------------------------- | ------------------------------------------------------------------ |
| 1 | `001_initial_schema.sql`      | Core tables: `profiles`, `projects`, `regions`, `jobs`, results, reports, logs. Enables `uuid-ossp` + `postgis`. |
| 2 | `002_supabase_setup.sql`      | Supabase-specific supplements (idempotent — safe to re-run).        |
| 3 | `003_rls_policies.sql`        | Row-Level Security policies for all tables.                        |
| 4 | `004_storage_policies.sql`    | Storage bucket access policies. **Requires the 5 buckets from step 4 above to already exist.** |
| 5 | `005_auth_triggers.sql`       | Trigger keeping `public.profiles` in sync with `auth.users` signups.|
| 6 | `006_realtime.sql`            | Enables Supabase Realtime (`postgres_changes`) on the `jobs` table. |
| 7 | `007_admin_settings.sql`      | `admin_settings` table for the admin panel UI.                      |

### Option A — Supabase SQL Editor (easiest, no local tooling)

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `database/schemas/001_initial_schema.sql` locally, copy its contents, paste into the editor, click **Run**.
3. Repeat for `002` → `003` → `004` → `005` → `006` → `007`, in order.
4. If a migration fails, fix the reported issue (usually a missing bucket or extension permission) and re-run only that file — the migrations are written to be idempotent where possible.

### Option B — `psql` from your terminal (faster for repeated setup)

Requires `psql` installed locally. Use the same `DATABASE_URL` you put in `.env`:

```bash
# Run all migrations in order
for f in database/schemas/0*.sql; do
  echo "==> Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

On Windows PowerShell:

```powershell
Get-ChildItem database\schemas\0*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "==> Applying $($_.Name)"
  psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $_.FullName
  if ($LASTEXITCODE -ne 0) { break }
}
```

### Option C — `psql` inside the backend container (no local psql needed)

Once the backend container is running (see §5), the alpine image includes `wget` but not `psql`. Use a throwaway postgres container instead:

```bash
docker run --rm -i --env DATABASE_URL="$DATABASE_URL" \
  -v "$PWD/database/schemas:/sql:ro" postgres:16-alpine \
  sh -c 'for f in /sql/0*.sql; do echo "==> $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || exit 1; done'
```

### Seed data (optional, for local testing only)

`database/seeds/001_test_schema.sql` inserts sample projects/regions/jobs for a dev user. **Do not run on production.** Apply the same way as a migration:

```bash
psql "$DATABASE_URL" -f database/seeds/001_test_schema.sql
```

### Verify the database is ready

```sql
-- In Supabase SQL Editor:
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY table_name;
-- Expect: admin_settings, classification_results, connectivity_graphs,
--         geojson_uploads, jobs, log_entries, profiles, projects,
--         regions, reports, segmentation_results
```

### Re-running / resetting

- **Re-run a single migration**: safe if it uses `CREATE ... IF NOT EXISTS` or `DROP POLICY IF EXISTS ...` (most of them do). If not, drop the offending object first.
- **Full reset (destructive, dev only)**:
  ```sql
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
  ```
  Then re-run all seven migrations. This wipes all data.

---

## 4. Step 2 — Create `.env` at the repo root

Copy the template:

```bash
cp .env.example .env
```

Fill in the **six required** values (everything else has sensible defaults):

| Variable                      | Where to get it                                                    |
| ----------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_URL`                | Supabase → Settings → API → Project URL                            |
| `SUPABASE_ANON_KEY`           | Supabase → Settings → API → anon public                            |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase → Settings → API → service_role                           |
| `SUPABASE_JWT_SECRET`         | Supabase → Settings → API → JWT Secret                             |
| `DATABASE_URL`                | Supabase → Settings → Database → Connection string (URI), password filled in |
| `INTERNAL_SECRET`             | Any random string — e.g. `openssl rand -hex 32`                    |

Mirror the two Supabase values into the `NEXT_PUBLIC_*` equivalents — they're baked into the frontend at build time and **must match**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<same as SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

Leave these as-is for local dev (change them for production — see §8):

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

Set `INFERENCE_SERVER_URL` depending on where inference runs:

| Scenario                              | Value                                |
| ------------------------------------- | ------------------------------------ |
| Running inference in the same compose | `http://inference:8000`              |
| Inference on your host, outside Docker| `http://host.docker.internal:8000`   |
| Remote inference host                 | `https://inference.yourdomain.com`   |
| Not running inference yet             | *(leave blank)*                      |

Set `PLANET_API_KEY` to your Planet Copernicus API key (get one free at planet.com/account).
This is used in two ways:
- **With inference**: the inference pipeline fetches the Sentinel-2 GeoTIFF for the job's AOI.
- **Without inference** (fallback): the backend searches Planet for the best scene, stores the
  scene ID, and the frontend renders it as a satellite tile overlay on the Map Analysis page.

---

## 5. Step 3 — Start backend + frontend (no inference)

```bash
docker compose up -d --build backend frontend
```

**Verify:**

```bash
curl http://localhost:8080/api/v1/health
# → {"status":"ok" or "degraded", "checks":{...}}
```

Then open http://localhost:5173 — the login page should load.

If health returns `error`, inspect logs:

```bash
docker compose logs -f backend
```

Most common causes: wrong `DATABASE_URL`, password not URL-encoded, or a missing storage bucket.

---

## 6. Step 4 — (Optional) Start inference

**Prereqs**

- The `./model/inference_server_project/` and `./model/weights/` directories exist in the repo.
- A Planet Copernicus API key (same key used for the satellite tile fallback).

Add to `.env`:

```dotenv
PLANET_API_KEY=your-planet-api-key-here
INFERENCE_DEVICE=cpu            # or "cuda" if you have a GPU
INFERENCE_SERVER_URL=http://inference:8000
```

Start the full stack:

```bash
docker compose --profile inference up -d --build
```

**Verify:**

```bash
curl http://localhost:8000/api/health           # → {"status":"ok","device":"cpu"}
curl http://localhost:8080/api/v1/health        # → checks.inference_server: "connected"
```

---

## 7. Step 5 — First-run sanity check (what to click)

1. Open http://localhost:5173 → **Sign up** → you'll land on the "pending approval" page.
2. In the Supabase **SQL Editor**, approve yourself as admin:

   ```sql
   UPDATE profiles
   SET approval_status = 'approved', role = 'admin'
   WHERE email = 'you@example.com';
   ```

3. Log back in → dashboard loads.
4. Go to **Map Analysis** → upload a small GeoJSON polygon → a job appears in **Processing**.
   - With inference running: progress bar advances through segmentation → classification → connectivity.
   - Without inference: job stays in `queued` / `running`. Expected.

---

## 8. Deploying for real (production changes)

The dev compose file is tuned for localhost. For a server deploy, change specifically:

- **Frontend env vars (rebuild required — baked in at build time):**
  ```dotenv
  NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
  NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws
  ```
  Then: `docker compose up -d --build frontend`

- **Reverse proxy** (Caddy / nginx / Traefik) terminating TLS in front of `backend:8080` and `frontend:5173`. Don't expose `:5173` directly to the internet — it's plain HTTP inside the container.

- **CORS** — set on the backend so it accepts the browser origin:
  ```dotenv
  FRONTEND_URL=https://yourdomain.com
  ```

- **`SERVER_ENV=production`** — disables verbose debug logging.

- **Secrets hygiene** — don't commit `.env`. Load it from outside the repo:
  ```bash
  docker compose --env-file /etc/road-quality/.env up -d
  ```

- **Inference placement** — if you have a GPU box, run inference there and point the backend at it:
  ```dotenv
  INFERENCE_SERVER_URL=https://inference.yourdomain.com
  ```
  Backend and inference do **not** need to share a machine.

- **Restart policy** — `restart: unless-stopped` and the backend healthcheck are already in `docker-compose.yml`. That's sufficient for a single-host deploy.

---

## 9. Troubleshooting cheatsheet

| Symptom                                           | Likely cause                                                     | Fix                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend loads but API calls 404                  | `NEXT_PUBLIC_API_URL` wrong at build time                        | Fix `.env`, then `docker compose up -d --build frontend`                                          |
| Health: `storage: inaccessible`                   | `satellite-images` bucket missing                                | Create it in Supabase → Storage                                                                   |
| Health: `database: disconnected`                  | Bad `DATABASE_URL` or unencoded password                         | Re-copy URI from Supabase; URL-encode special chars in password                                   |
| Health: `inference_server: disconnected`          | Inference not running, wrong URL, or firewall                    | `docker compose exec backend wget -qO- $INFERENCE_SERVER_URL/api/health`                          |
| Login loops back to "pending approval"            | `profiles` row not approved                                      | `UPDATE profiles SET approval_status='approved' ...`                                              |
| 401 on every API call                             | `SUPABASE_JWT_SECRET` doesn't match the project the frontend hits| Re-copy JWT secret; ensure `NEXT_PUBLIC_SUPABASE_URL` points to the same project as `SUPABASE_URL`|
| Build fails on `../proper fyp/...`                | Inference sibling directory missing                              | Don't use `--profile inference`; run only `backend frontend`                                      |
| WebSocket won't connect in prod                   | `NEXT_PUBLIC_WS_URL` still `ws://localhost:8080/ws`              | Set to `wss://api.yourdomain.com/ws` and rebuild frontend                                         |
| Satellite tile overlay never appears on map       | `PLANET_API_KEY` missing or no scene found in date range         | Set `PLANET_API_KEY` in `.env` and restart backend; re-dispatch the job; check backend logs for `planet:` entries |
| Satellite tiles return 503                        | `PLANET_API_KEY` not set in backend environment                  | Add `PLANET_API_KEY` to `.env` and rebuild: `docker compose up -d --build backend`                |

---

## 10. Useful commands

```bash
docker compose ps                                 # what's running
docker compose logs -f backend                    # tail backend logs
docker compose logs -f inference                  # tail inference logs
docker compose down                               # stop everything
docker compose down -v                            # stop + wipe inference-outputs volume
docker compose up -d --build backend              # rebuild only backend after code change
docker compose up -d --build frontend             # rebuild only frontend (after .env change)
docker compose --profile inference up -d --build  # full stack incl. inference
```
