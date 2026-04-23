"""FastAPI application exposing the inference pipeline."""

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import redis.asyncio as aioredis

from .config import settings
from .pipeline import InferencePipeline
from celery import Celery


celery_app = Celery("inference", broker=settings.redis_url,
                     backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]


pipeline: Optional[InferencePipeline] = None

app = FastAPI(title="Road Assessment Inference API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FetchAndRunRequest(BaseModel):
    aoi_bbox:        list = Field(
        ..., description="[min_lon, min_lat, max_lon, max_lat] in WGS84")
    start_date:      str  = Field(..., description="YYYY-MM-DD")
    end_date:        str  = Field(..., description="YYYY-MM-DD")
    region_name:     str  = "Unknown region"
    max_cloud_cover: Optional[float] = None
    resolution_m:    Optional[int]   = None


@app.on_event("startup")
def startup():
    """Initialize pipeline on server startup."""
    global pipeline
    pipeline = InferencePipeline()


@app.get("/api/health")
def health():
    """Health check endpoint."""
    return {"status": "ok", "device": pipeline.device if pipeline else "none"}


@app.post("/api/jobs/fetch-and-run")
async def fetch_and_run(req: FetchAndRunRequest):
    """Trigger a pipeline run on a fresh SentinelHub fetch."""
    if len(req.aoi_bbox) != 4:
        raise HTTPException(400, "aoi_bbox must be [min_lon, min_lat, max_lon, max_lat]")

    task = run_fetch_and_run.delay(
        aoi_bbox        = req.aoi_bbox,
        start_date      = req.start_date,
        end_date        = req.end_date,
        region_name     = req.region_name,
        max_cloud_cover = req.max_cloud_cover,
        resolution_m    = req.resolution_m,
    )

    return {
        "job_id":        task.id,
        "status":        "pending",
        "websocket_url": f"/ws/jobs/{task.id}",
        "created_at":    datetime.utcnow().isoformat() + "Z",
    }


@app.post("/api/jobs/upload-and-run")
async def upload_and_run(
    file:        UploadFile = File(...),
    region_name: str        = Form("Unknown region"),
):
    """Run pipeline on a user-uploaded GeoTIFF."""
    if not file.filename.lower().endswith(".tif"):
        raise HTTPException(400, "Must be a .tif file")

    upload_path = settings.output_dir / f"upload_{uuid.uuid4().hex[:8]}.tif"
    with open(upload_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    task = run_on_upload.delay(
        tif_path    = str(upload_path),
        region_name = region_name,
    )
    return {
        "job_id":        task.id,
        "status":        "pending",
        "websocket_url": f"/ws/jobs/{task.id}",
    }


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
    """Get current job status and progress."""
    task = celery_app.AsyncResult(job_id)
    state = task.state
    info  = task.info if isinstance(task.info, dict) else {}
    return {
        "job_id":       job_id,
        "status":       state.lower(),
        "stage":        info.get("stage"),
        "progress_pct": info.get("progress_pct", 0),
        "message":      info.get("message"),
        "result":       task.result if state == "SUCCESS" else None,
    }


@app.get("/api/jobs/{job_id}/download/{file_key}")
async def download_output(job_id: str, file_key: str):
    """Download a specific output file from a completed job."""
    task = celery_app.AsyncResult(job_id)
    if task.state != "SUCCESS":
        raise HTTPException(404, "Job not complete")
    outputs = task.result.get("outputs", {})
    if file_key not in outputs:
        raise HTTPException(404, f"Output '{file_key}' not found")
    return FileResponse(outputs[file_key], filename=Path(outputs[file_key]).name)


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(ws: WebSocket, job_id: str):
    """WebSocket connection for real-time job progress updates."""
    await ws.accept()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"job:{job_id}")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await ws.send_text(message["data"])
                try:
                    data = json.loads(message["data"])
                    if data.get("type") in ("job_completed", "job_failed"):
                        break
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"job:{job_id}")
        await redis.close()


# ── Celery tasks ──────────────────────────────────────────────────────────

def _publish(job_id: str, event: dict):
    """Publish event to Redis pub/sub for WebSocket relay."""
    import redis as sync_redis, json
    r = sync_redis.from_url(settings.redis_url)
    r.publish(f"job:{job_id}", json.dumps(event))


@celery_app.task(bind=True)
def run_fetch_and_run(
    self, aoi_bbox, start_date, end_date, region_name,
    max_cloud_cover, resolution_m,
):
    """Celery task: fetch imagery and run full pipeline."""
    from .pipeline import InferencePipeline
    pipe = InferencePipeline()
    job_id = self.request.id

    def cb(stage, pct, msg):
        self.update_state(
            state="PROGRESS",
            meta={"stage": stage, "progress_pct": pct, "message": msg})
        _publish(job_id, {
            "type":         "progress_update",
            "job_id":       job_id,
            "timestamp":    datetime.utcnow().isoformat(),
            "payload":      {"stage": stage, "progress_pct": pct,
                              "message": msg}
        })

    result = pipe.fetch_and_run(
        aoi_bbox        = tuple(aoi_bbox),
        start_date      = start_date,
        end_date        = end_date,
        region_name     = region_name,
        max_cloud_cover = max_cloud_cover,
        resolution_m    = resolution_m,
        progress_callback = cb,
    )

    event_type = "job_completed" if result["status"] == "success" else "job_failed"
    _publish(job_id, {
        "type":      event_type,
        "job_id":    job_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload":   result,
    })
    return result


@celery_app.task(bind=True)
def run_on_upload(self, tif_path, region_name):
    """Celery task: run pipeline on uploaded GeoTIFF."""
    from .pipeline import InferencePipeline
    pipe = InferencePipeline()
    job_id = self.request.id

    def cb(stage, pct, msg):
        self.update_state(
            state="PROGRESS",
            meta={"stage": stage, "progress_pct": pct, "message": msg})
        _publish(job_id, {
            "type":      "progress_update",
            "job_id":    job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "payload":   {"stage": stage, "progress_pct": pct, "message": msg}
        })

    result = pipe.run_on_tif(
        tif_path    = Path(tif_path),
        region_name = region_name,
        progress_callback = cb,
    )

    event_type = "job_completed" if result["status"] == "success" else "job_failed"
    _publish(job_id, {
        "type":      event_type,
        "job_id":    job_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload":   result,
    })
    return result
