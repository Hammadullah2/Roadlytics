# Current State and Next Steps

## Current Working State

- Repository: `https://github.com/Hammadullah2/Roadlytics`
- Local repo: `C:\Users\hammad\Roadlytics`
- Active branch: `codex/modal-inference-migration`
- Live app: `http://52.139.179.111`
- Azure VM path: `/opt/roadlytics`
- Test GeoTIFF: `C:\Users\hammad\Roadlytics\tmp_e2e\testing170.tif`
- Modal app: `roadlytics-inference`
- Modal function: `run_pipeline`
- Modal GPU preference: `A10`, fallback `T4`

Do not overwrite local changes without inspecting them. The latest upload-proxy and transparent-tile fixes were developed during testing and may be ahead of GitHub until the branch is pushed.

## Already Implemented

- Phase 1 web app with FastAPI, Next.js, Docker Compose, SQLite, Azure Blob, OSM basemap, Leaflet overlays, HTML reports, and RAG assistant.
- Modal inference path with `ROADLYTICS_PROCESSOR=modal`.
- RAG assistant routes and UI, with Gemini support when `GEMINI_API_KEY` is set and local extractive fallback when it is not.
- Modal app deployed as `roadlytics-inference`.
- Modal smoke test `PakOSM + KMeans` completed successfully with 13 artifacts and registered map layers.
- Backend worker no longer dies after a failed job.
- Stage 5 connectivity has a bounded large-raster criticality path.
- Raster tiles outside dataset bounds now return transparent PNG `200` instead of `500`.
- VM upload mode can be switched with `ROADLYTICS_UPLOAD_TRANSPORT=auto|backend_proxy`.

## Live VM Environment To Preserve

The VM should keep:

```bash
ROADLYTICS_PROCESSOR=modal
ROADLYTICS_MODAL_APP=roadlytics-inference
ROADLYTICS_MODAL_FUNCTION=run_pipeline
ROADLYTICS_MODAL_ENVIRONMENT=main
ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS=10
ROADLYTICS_UPLOAD_TRANSPORT=backend_proxy
NEXT_PUBLIC_API_BASE_URL=http://52.139.179.111
```

Azure Blob credentials, Modal tokens, and any Gemini key are secrets. Do not paste them into docs, logs, screenshots, or commits.

## Current Testing Blocker

The browser test with `testing170.tif` has not completed yet. Observed behavior:

- Browser successfully called `POST /api/uploads/init`.
- Direct Azure SAS upload stalled before `POST /api/jobs`.
- Backend-proxy upload is now implemented and live, but the local-to-VM upload path was extremely slow and reset after about `15.6 MB` of a `185 MB` file.
- No new `testing170` job was created from that failed attempt.

Antigravity should retry the browser flow with its Chrome extension and monitor upload progress plus backend logs. If the browser still cannot upload reliably, stage the file onto the VM or use a smaller clipped GeoTIFF for UI smoke testing, then run the full `testing170` inference once upload transport is proven stable.

## Recommended Next Work

1. Pull or inspect the latest `codex/modal-inference-migration` branch.
2. Confirm the upload-proxy and transparent-tile fixes are present before testing.
3. Run the Antigravity test plan in `docs/handoff/antigravity-testing-plan.md`.
4. Complete the remaining full GPU test: `testing170.tif` with `DeepLabV3 + EfficientNet`.
5. Verify map, report, artifacts, analytics, RAG, and failure paths.
6. Commit/push any additional fixes before handing the repo to another tool or agent.
