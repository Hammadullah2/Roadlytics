# Docker First Run

This project runs in Docker as two services:

- `backend` on `http://localhost:8080`
- `frontend` on `http://localhost:5173`

The backend still needs external Supabase/Postgres credentials from a local `.env` file.

## Prerequisites

- Docker Desktop with Docker Compose enabled
- Access to the required Supabase project values

## 1. Get the latest code

If you already have the repo cloned:

```powershell
git pull --ff-only origin main
```

If this is your first clone:

```powershell
git clone https://github.com/bachal-abro/road-quality-assessment.git
cd road-quality-assessment
```

## 2. Create your environment file

From the repo root:

```powershell
Copy-Item .env.example .env
```

If you already keep local credentials in `backend/env`, copy those values into repo-root `.env` because Docker Compose reads repo-root `.env`.

Fill in these required backend values in `.env`:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `INTERNAL_SECRET`

Fill in these required frontend build values in `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_WS_URL`

For `DATABASE_URL`, replace both placeholder parts in the example value:

- `your_password`
- `your-project-ref`

## 3. Build and start the containers

From the repo root:

```powershell
docker compose up --build
```

## 4. Verify everything is running

- Backend health check: `http://localhost:8080/health`
- Frontend UI: `http://localhost:5173`

## Automated smoke test

After `.env` is ready, you can run the container smoke test from the repo root:

```bash
bash scripts/verify_docker.sh
```

## 5. Stop the stack

In the same terminal, press `Ctrl+C`, then run:

```powershell
docker compose down
```

## 6. Start it again later

If the images are already built:

```powershell
docker compose up
```

## Notes

- The frontend is a Vite/React app served as static files in Docker.
- Several frontend screens still use mocked data, so the UI can load even before full backend integration is complete.
- If the backend container exits immediately, check `.env` first. Missing required backend variables will prevent startup.
- The sample `DATABASE_URL` in `.env.example` is intentionally parseable, but it still will not connect until you replace the placeholder password and project ref with real values.
- The frontend can also be run and deployed independently because it currently uses mocked data for several screens.
- The frontend image build embeds the `NEXT_PUBLIC_*` values from repo-root `.env`, so rebuild the frontend container after changing them.
