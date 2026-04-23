# Road Quality Assessment Platform

Quick start guide for new developers.

## Docker

For the Docker-first setup, follow [DOCKER_FIRST_RUN.md](DOCKER_FIRST_RUN.md).
The automated container smoke test is `bash scripts/verify_docker.sh`.

## Prerequisites

- Go `1.25+`
- Node.js `20+` and npm
- A PostgreSQL database (Supabase or local Postgres)

## 1) Clone and enter project

```bash
git clone https://github.com/bachal-abro/road-quality-assessment.git
cd road-quality-assessment
```

## 2) Configure environment

Copy `.env.example` to `.env` in the project root and fill required values.

Required backend values:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `INTERNAL_SECRET`

Example (PowerShell):

```powershell
Copy-Item .env.example .env
```

## 3) Run backend (Go API)

From repo root:

```bash
cd backend
go mod download
go run ./cmd/server
```

Backend runs on: `http://localhost:8080`  
Health check: `http://localhost:8080/health`

## 4) Run frontend (Vite + React)

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:5173`

## 5) Build checks

Frontend type-check/build:

```bash
cd frontend
npm run build
```

## Notes

- API base in current frontend code is mocked in several screens; some flows do not require live backend responses yet.
- Docker now runs the Go backend and the Vite frontend as separate services.
