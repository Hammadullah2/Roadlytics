# System Architecture Overview

## Project: AI-Driven Road Quality Assessment

### Scope
We build the **backend + frontend + database** layer. The AI/ML models are developed
separately. Our system:
1. Accepts GeoJSON file uploads from users
2. Passes them to the model via goroutines
3. Receives processed results back from the model
4. Stores everything in Supabase (PostgreSQL + Storage)
5. Displays results on a live interactive map

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Docker Container                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Frontend (Next.js :3000)                   │  │
│  │  Login | Dashboard | Projects | Map Analysis |          │  │
│  │  Processing Jobs | Reports                              │  │
│  │  Interactive map with GeoJSON overlays (Leaflet)        │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │ HTTP / WebSocket                   │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │              Backend (Go :8080)                          │  │
│  │                                                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │  │
│  │  │  Middleware  │  │   Router    │  │   Handlers    │  │  │
│  │  │  JWT Auth    │  │  REST API   │  │  HTTP + WS    │  │  │
│  │  │  CORS        │  │  /api/v1/*  │  │               │  │  │
│  │  └─────────────┘  └─────────────┘  └───────────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │              Service Layer                        │  │  │
│  │  │  UserSvc | IngestionSvc | ProgressSvc |           │  │  │
│  │  │  EvaluationSvc | NotificationSvc | ReportSvc      │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │        Orchestrator (Goroutines)                  │  │  │
│  │  │  ModelDispatcher | ProgressPoller | JobListener | │  │  │
│  │  │  ResultParser | QueueMonitor | UIPushService      │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │           Repository Layer                        │  │  │
│  │  │  ProfileRepo | ProjectRepo | RegionRepo |         │  │  │
│  │  │  JobRepo | ResultRepo | ReportRepo                │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────┬──────────────────┬────────────────────┘
                       │                  │
            ┌──────────▼──────────┐  ┌────▼────────────────┐
            │   Supabase Cloud    │  │   AI Model (ext.)   │
            │                     │  │                      │
            │  Auth (email/Google) │  │  Reads GeoJSON from │
            │  PostgreSQL (DB)    │  │  Supabase, processes │
            │  Storage (files)    │  │  and writes results  │
            │  Row Level Security │  │  back to Supabase    │
            └─────────────────────┘  └─────────────────────┘
```

### Authentication Flow

```
User ──▶ Supabase Auth (email/password or Google OAuth)
              │
              ▼
        auth.users row created
              │
              ▼
        DB trigger: handle_new_user()
              │
              ▼
        profiles row created (approval_status = 'pending')
              │
              ▼
        Admin reviews in Admin Panel
              │
              ▼
        Admin approves → approval_status = 'approved'
              │
              ▼
        User can now access resources (enforced by RLS + middleware)
```

### Data Flow: GeoJSON → Model → Results → Map

```
1. User uploads GeoJSON file via frontend
2. Backend stores file in Supabase Storage
3. Backend creates geojson_uploads record + job (status=pending)
4. ModelDispatcher goroutine detects pending job
5. ModelDispatcher notifies model (or model polls Supabase directly)
6. Model reads GeoJSON from Supabase Storage
7. Model processes: segmentation → classification → connectivity
8. Model writes results back to Supabase DB
9. JobListener goroutine detects completion
10. ResultParser reads + validates the GeoJSON results
11. UIPushService sends WebSocket notification to frontend
12. Frontend renders GeoJSON layers on the interactive map
```

### Tech Stack

| Layer       | Technology                              |
|-------------|-----------------------------------------|
| Frontend    | Next.js 14+, TypeScript, Tailwind CSS   |
| Map         | Leaflet / React-Leaflet                 |
| Backend     | Go 1.22+, standard library + chi router |
| Auth        | Supabase Auth (email + Google OAuth)    |
| Database    | Supabase PostgreSQL + PostGIS           |
| Storage     | Supabase Storage                        |
| Real-time   | WebSocket (gorilla/websocket)           |
| Deployment  | Standalone Docker container             |
| Model API   | External (reads/writes Supabase)        |

### CS Concepts Applied

| Concept          | Where Applied                                              |
|------------------|------------------------------------------------------------|
| OOP              | Go interfaces for repository/service contracts             |
| Data Structures  | Adjacency list (graph), priority queue (Dijkstra), maps    |
| DBMS             | Normalized schema, indexes, FK constraints, JSONB, RLS     |
| ITP              | REST API, HTTP/WebSocket protocols, JWT, CORS              |
