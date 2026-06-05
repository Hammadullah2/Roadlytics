# Roadlytics Assistant RAG Setup

Roadlytics includes an optional Gemini-powered assistant for explaining jobs, reports, map layers,
failures, and project-library context. The feature works in two modes:

- With `GEMINI_API_KEY`: grounded Gemini responses using Roadlytics evidence.
- Without `GEMINI_API_KEY`: local extractive fallback so the UI still responds from indexed evidence.

## What The Assistant Can See

The assistant retrieves from:

- Roadlytics static method notes and guardrails.
- Job metadata, status, selected models, stage, progress, and errors.
- Job event timeline.
- Artifact manifest, layer names, filenames, and bounds.
- Analytics snapshots and report text when available locally.
- Visible map layer names and viewport bounds passed from the frontend.

It does not treat model outputs as field-confirmed truth. Responses include a field-inspection caveat
for operational decisions.

## Manual Configuration

Create a Gemini API key in Google AI Studio, then add it to the backend environment.

For local Docker Compose, add this to your local `.env` file:

```bash
GEMINI_API_KEY=your_google_ai_studio_key_here
ROADLYTICS_ASSISTANT_MODEL=gemini-2.5-flash
ROADLYTICS_ASSISTANT_EMBEDDING_MODEL=gemini-embedding-001
ROADLYTICS_ASSISTANT_CHROMA_PATH=/app/backend/data/chroma
ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS=18000
```

For the Azure VM, edit:

```bash
/opt/roadlytics/deploy/azure/.env.vm
```

and add the same values:

```bash
GEMINI_API_KEY=your_google_ai_studio_key_here
ROADLYTICS_ASSISTANT_MODEL=gemini-2.5-flash
ROADLYTICS_ASSISTANT_EMBEDDING_MODEL=gemini-embedding-001
ROADLYTICS_ASSISTANT_CHROMA_PATH=/app/backend/data/chroma
ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS=18000
```

## Rebuild On The VM

The backend image must be rebuilt because the assistant adds Python dependencies.

```bash
cd /opt/roadlytics
git pull origin codex/modal-inference-migration
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml build backend frontend
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml up -d
```

Check the services:

```bash
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml ps
docker compose --env-file deploy/azure/.env.vm -f docker-compose.yml -f deploy/azure/docker-compose.prod.yml logs backend --tail=120
```

## API Endpoints

- `POST /api/assistant/chat`
- `GET /api/assistant/suggestions?mode=map`
- `POST /api/assistant/reindex`

The frontend currently mounts the assistant drawer on Dashboard, Map Analysis, and Reports.

## Notes

- ChromaDB persists under `backend/data/chroma` through the existing Docker volume mount.
- Roadlytics uses local hash embeddings for Chroma retrieval to avoid extra model downloads on the VM.
- Gemini is used only for natural-language generation, not for changing job artifacts or analytics.
