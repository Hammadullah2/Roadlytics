"""Bridge: writes inference progress and results directly to Supabase, then notifies the backend."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from supabase import create_client, Client as SupabaseClient

from .config import settings

logger = logging.getLogger(__name__)

_client: Optional[SupabaseClient] = None


def _supabase() -> SupabaseClient:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for bridge")
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


# ── Job state writes ──────────────────────────────────────────────────────────

def mark_job_running(backend_job_id: str, inference_job_id: str) -> None:
    """Record that the inference task has started and store the Celery task ID."""
    if not backend_job_id:
        return
    try:
        now = _now()
        _supabase().table("jobs").update(
            {
                "status": "running",
                "progress": 0,
                "started_at": now,
                "result_refs": json.dumps({"inference_job_id": inference_job_id}),
            }
        ).eq("id", backend_job_id).execute()
    except Exception as exc:
        logger.warning("bridge: mark_job_running failed for %s: %s", backend_job_id, exc)


def update_job_progress(backend_job_id: str, progress_pct: int) -> None:
    """Update the progress percentage on the backend job row."""
    if not backend_job_id:
        return
    try:
        _supabase().table("jobs").update(
            {"status": "running", "progress": max(0, min(100, progress_pct))}
        ).eq("id", backend_job_id).execute()
    except Exception as exc:
        logger.warning("bridge: update_job_progress failed for %s: %s", backend_job_id, exc)


def mark_job_complete(backend_job_id: str, inference_job_id: str, result: dict, storage_refs: dict) -> None:
    """Mark the job as completed and persist output Storage URLs + stats."""
    if not backend_job_id:
        return
    try:
        result_refs = {
            "inference_job_id": inference_job_id,
            "stats": result.get("stats"),
            "downloads": storage_refs,
        }
        _supabase().table("jobs").update(
            {
                "status": "completed",
                "progress": 100,
                "completed_at": _now(),
                "result_refs": json.dumps(result_refs),
            }
        ).eq("id", backend_job_id).execute()
    except Exception as exc:
        logger.error("bridge: mark_job_complete failed for %s: %s", backend_job_id, exc)

    _notify_backend(
        backend_job_id,
        progress=100,
        stage="connectivity",
        status="completed",
        downloads=storage_refs,
        stats=result.get("stats"),
    )


def mark_job_failed(backend_job_id: str, error_message: str) -> None:
    """Mark the job as failed."""
    if not backend_job_id:
        return
    try:
        _supabase().table("jobs").update(
            {
                "status": "failed",
                "progress": 0,
                "completed_at": _now(),
                "error_message": error_message[:2000],
            }
        ).eq("id", backend_job_id).execute()
    except Exception as exc:
        logger.error("bridge: mark_job_failed failed for %s: %s", backend_job_id, exc)

    _notify_backend(backend_job_id, progress=0, stage="segmentation", status="failed")


# ── Output file storage (S3/R2 preferred; Supabase fallback) ─────────────────

def _use_s3() -> bool:
    return bool(settings.s3_access_key_id and settings.s3_bucket_name)


def _s3_client():
    import boto3
    kwargs: dict = {
        "aws_access_key_id":     settings.s3_access_key_id,
        "aws_secret_access_key": settings.s3_secret_access_key,
    }
    if settings.s3_endpoint_url:
        kwargs["endpoint_url"] = settings.s3_endpoint_url
    return boto3.client("s3", **kwargs)


def _upload_to_s3(local_path: Path, storage_key: str) -> Optional[str]:
    """Upload a file to S3/R2. Returns the public URL or None."""
    if not local_path.exists():
        logger.warning("bridge: output file missing: %s", local_path)
        return None
    try:
        client = _s3_client()
        with open(local_path, "rb") as fh:
            client.put_object(
                Bucket=settings.s3_bucket_name,
                Key=storage_key,
                Body=fh,
                ContentType=_content_type(local_path),
            )
        base = settings.s3_public_base_url.rstrip("/")
        return f"{base}/{storage_key}"
    except Exception as exc:
        logger.error("bridge: S3 upload failed for %s → %s: %s", local_path, storage_key, exc)
        return None


def _upload_to_supabase(local_path: Path, bucket: str, storage_path: str) -> Optional[str]:
    """Upload a file to Supabase Storage. Returns the public URL or None.
    Supabase free tier has a 50 MB per-file limit — only safe for small outputs."""
    if not local_path.exists():
        logger.warning("bridge: output file missing: %s", local_path)
        return None
    try:
        with open(local_path, "rb") as fh:
            data = fh.read()
        content_type = _content_type(local_path)
        _supabase().storage.from_(bucket).upload(
            storage_path,
            data,
            {"content-type": content_type, "upsert": "true"},
        )
        return _supabase().storage.from_(bucket).get_public_url(storage_path)
    except Exception as exc:
        logger.error("bridge: Supabase upload failed for %s → %s/%s: %s", local_path, bucket, storage_path, exc)
        return None


def upload_job_outputs(backend_job_id: str, outputs: dict) -> dict:
    """
    Upload all inference output files to S3/R2 (if configured) or Supabase Storage.

    ``outputs`` is the pipeline's output dict: file_key → local path string.
    Returns a dict of file_key → public URL (keys with failed uploads are omitted).
    """
    storage_refs: dict = {}

    for file_key, local_path_str in outputs.items():
        if not local_path_str:
            continue
        local_path = Path(local_path_str)
        if not local_path.exists():
            continue

        storage_key = f"jobs/{backend_job_id}/{local_path.name}"

        if _use_s3():
            url = _upload_to_s3(local_path, storage_key)
        else:
            url = _upload_to_supabase(local_path, settings.storage_bucket_outputs, storage_key)

        if url:
            storage_refs[file_key] = url

    return storage_refs


# ── Backend callback ──────────────────────────────────────────────────────────

def _notify_backend(
    backend_job_id: str,
    *,
    progress: int,
    stage: str,
    status: str,
    downloads: dict | None = None,
    stats: dict | None = None,
) -> None:
    """POST a signed progress/completion event to the backend callback endpoint."""
    url = settings.backend_callback_url
    secret = settings.internal_secret
    if not url or not secret:
        return

    endpoint = f"{url.rstrip('/')}/api/v1/internal/jobs/{backend_job_id}/progress"
    payload: dict = {"progress": progress, "stage": stage, "status": status}
    if downloads:
        payload["downloads"] = downloads
    if stats:
        payload["stats"] = stats

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                endpoint,
                json=payload,
                headers={"X-Internal-Secret": secret},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "bridge: callback returned %d for job %s", resp.status_code, backend_job_id
                )
    except Exception as exc:
        logger.warning("bridge: callback failed for job %s: %s", backend_job_id, exc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _content_type(path: Path) -> str:
    return {
        ".json": "application/json",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
        ".graphml": "application/xml",
        ".csv": "text/csv",
        ".shp": "application/octet-stream",
    }.get(path.suffix.lower(), "application/octet-stream")
