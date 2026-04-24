"""FastAPI application exposing the inference pipeline."""

import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
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



@app.on_event("startup")
def startup():
    global pipeline
    pipeline = InferencePipeline()


@app.get("/api/health")
def health():
    return {"status": "ok", "device": pipeline.device if pipeline else "none"}



@app.post("/api/jobs/upload-and-run")
async def upload_and_run(
    file:           UploadFile = File(...),
    region_name:    str        = Form("Unknown region"),
    backend_job_id: str        = Form(""),
    seg_model:      str        = Form(""),
    clf_model:      str        = Form(""),
):
    if not file.filename.lower().endswith(".tif"):
        raise HTTPException(400, "Must be a .tif file")

    upload_path = settings.output_dir / f"upload_{uuid.uuid4().hex[:8]}.tif"
    with open(upload_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    task = run_on_upload.delay(
        tif_path       = str(upload_path),
        region_name    = region_name,
        backend_job_id = backend_job_id or None,
        seg_model      = seg_model or None,
        clf_model      = clf_model or None,
    )
    return {
        "job_id":        task.id,
        "status":        "pending",
        "websocket_url": f"/ws/jobs/{task.id}",
    }


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
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


@app.websocket("/ws/jobs/{job_id}")
async def job_websocket(ws: WebSocket, job_id: str):
    """WebSocket for real-time progress — available for local dev and direct monitoring."""
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


# ── Celery tasks ──────────────────────────────────────────────────────────────

def _publish(job_id: str, event: dict):
    """Publish an event to Redis pub/sub for local WebSocket relay."""
    import redis as sync_redis
    r = sync_redis.from_url(settings.redis_url)
    r.publish(f"job:{job_id}", json.dumps(event))


def _progress_callback_factory(self, job_id: str, backend_job_id: Optional[str]):
    """Return a progress callback that updates Celery state, Redis, and Supabase."""
    def cb(stage: str, pct: int, msg: str):
        self.update_state(
            state="PROGRESS",
            meta={"stage": stage, "progress_pct": pct, "message": msg},
        )
        _publish(job_id, {
            "type":      "progress_update",
            "job_id":    job_id,
            "timestamp": datetime.utcnow().isoformat(),
            "payload":   {"stage": stage, "progress_pct": pct, "message": msg},
        })
        if backend_job_id:
            try:
                from . import supabase_bridge as bridge
                bridge.update_job_progress(backend_job_id, pct)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("bridge progress update failed: %s", exc)
    return cb



@celery_app.task(bind=True)
def run_on_upload(self, tif_path, region_name, backend_job_id=None, seg_model=None, clf_model=None):
    """Run the pipeline on a user-uploaded GeoTIFF."""
    from .pipeline import InferencePipeline
    from . import supabase_bridge as bridge

    pipe   = InferencePipeline()
    job_id = self.request.id

    if backend_job_id:
        bridge.mark_job_running(backend_job_id, job_id)

    cb = _progress_callback_factory(self, job_id, backend_job_id)

    pipeline_kwargs = {}
    if seg_model:
        pipeline_kwargs["seg_model"] = seg_model
    if clf_model:
        pipeline_kwargs["clf_model"] = clf_model

    result = pipe.run_on_tif(
        tif_path          = Path(tif_path),
        region_name       = region_name,
        progress_callback = cb,
        **pipeline_kwargs,
    )

    _finalise(job_id, backend_job_id, result)
    return result


def _finalise(job_id: str, backend_job_id: Optional[str], result: dict):
    """Publish terminal event to Redis and, when linked, write final state to Supabase."""
    success      = result.get("status") == "success"
    event_type   = "job_completed" if success else "job_failed"

    _publish(job_id, {
        "type":      event_type,
        "job_id":    job_id,
        "timestamp": datetime.utcnow().isoformat(),
        "payload":   result,
    })

    if not backend_job_id:
        return

    try:
        from . import supabase_bridge as bridge

        if success:
            outputs      = result.get("outputs", {})
            storage_refs = bridge.upload_job_outputs(backend_job_id, outputs)
            bridge.mark_job_complete(backend_job_id, job_id, result, storage_refs)
        else:
            error_msg = result.get("error_message", "Pipeline error")
            bridge.mark_job_failed(backend_job_id, error_msg)

    except Exception as exc:
        import logging
        logging.getLogger(__name__).error("bridge finalise failed for %s: %s", backend_job_id, exc)
