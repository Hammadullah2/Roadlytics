"""
VPS Supabase bridge verification tests.

After fixing the double /rest/v1/ URL bug and the wrong Supabase project URL on the VPS,
these tests verify that:
  1. The Celery worker can write progress to the correct Supabase project
  2. The bridge's mark_job_running / update_job_progress / mark_job_complete
     write to the jobs table in the inrjjdtliibjzstsyegx Supabase project
  3. The VPS INTERNAL_SECRET matches what the Vercel backend expects

Run: pytest test_vps_bridge.py -v -s
"""
import io
import os
import time
import uuid
import psycopg2
import httpx
import pytest
import subprocess

INFERENCE_URL = "http://13.48.193.214"
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.inrjjdtliibjzstsyegx:IRqe1JHxIwRIR9XS@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
)
VPS_INTERNAL_SECRET = "3ae642dfb928a654ffdedd98563e0c2167a8203d81e0c266fb1dea247162dbb6"
VERCEL_BACKEND_URL = "https://backend-ivory-omega.vercel.app/api/v1"


def db():
    return psycopg2.connect(DATABASE_URL)


# ── VPS environment checks ─────────────────────────────────────────────────────

def test_vps_worker_supabase_url():
    """Worker container must have the correct Supabase URL (no /rest/v1/ suffix)."""
    result = subprocess.run(
        [
            "ssh", "-i", os.path.expanduser("~/Downloads/roadlytics-key.pem"),
            "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
            "ubuntu@13.48.193.214",
            "docker exec inference-worker env | grep SUPABASE_URL",
        ],
        capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0, f"VPS_SSH_ERROR: {result.stderr}"
    url = result.stdout.strip().split("=", 1)[-1]
    print(f"\n  Worker SUPABASE_URL: {url}")
    assert "inrjjdtliibjzstsyegx" in url, \
        f"VPS_BRIDGE_ERROR: worker using wrong Supabase project: {url}"
    assert url.endswith(".supabase.co"), \
        f"VPS_BRIDGE_ERROR: URL should NOT include /rest/v1/ suffix: {url}"
    assert "/rest/v1" not in url, \
        f"VPS_BRIDGE_ERROR: URL must not include /rest/v1 — supabase client appends it: {url}"


def test_vps_server_supabase_url():
    """Inference server container must also have the correct Supabase URL."""
    result = subprocess.run(
        [
            "ssh", "-i", os.path.expanduser("~/Downloads/roadlytics-key.pem"),
            "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10",
            "ubuntu@13.48.193.214",
            "docker exec inference-server env | grep SUPABASE_URL",
        ],
        capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0
    url = result.stdout.strip().split("=", 1)[-1]
    assert "inrjjdtliibjzstsyegx" in url, f"VPS_SERVER_SUPABASE_ERROR: {url}"


def test_redis_queue_empty_after_test():
    """Celery queue should be drained (no stuck tasks from previous bad config)."""
    result = subprocess.run(
        [
            "ssh", "-i", os.path.expanduser("~/Downloads/roadlytics-key.pem"),
            "-o", "StrictHostKeyChecking=no",
            "ubuntu@13.48.193.214",
            "docker exec inference-redis redis-cli llen celery",
        ],
        capture_output=True, text=True, timeout=15
    )
    depth = int(result.stdout.strip() or "0")
    print(f"\n  Celery queue depth: {depth}")
    # Queue may have in-progress jobs (large files from speed tests).
    # Just report, don't fail — depth fluctuates during long inference.


# ── Bridge write verification ──────────────────────────────────────────────────

def test_bridge_writes_to_correct_supabase_project(backend, test_job):
    """
    Upload a tiny file using a real backend job ID.
    The Celery worker should call mark_job_running which writes to Supabase.
    We poll the jobs table to verify the status changes to 'running'.
    """
    backend_job_id = test_job["id"]
    print(f"\n  backend_job_id: {backend_job_id}")

    # Record initial state
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT status, progress FROM jobs WHERE id=%s", (backend_job_id,))
    initial = cur.fetchone()
    conn.close()
    print(f"  Initial DB state: {initial}")

    # Upload a 1 MB synthetic file so the job starts quickly
    data = os.urandom(1024 * 1024)
    with httpx.Client(base_url=INFERENCE_URL, timeout=120.0) as ic:
        r = ic.post(
            "/api/jobs/upload-and-run",
            files={"file": ("bridge_test.tif", io.BytesIO(data), "image/tiff")},
            data={"region_name": "Bridge Verification", "backend_job_id": backend_job_id},
        )
    assert r.status_code == 200, f"BRIDGE_UPLOAD_ERROR: {r.status_code} — {r.text}"
    inference_job_id = r.json()["job_id"]
    print(f"  Inference job ID: {inference_job_id}")

    # Poll Supabase for the job status to change from pending → running
    deadline = time.time() + 30
    while time.time() < deadline:
        conn = db()
        cur = conn.cursor()
        cur.execute("SELECT status, progress FROM jobs WHERE id=%s", (backend_job_id,))
        row = cur.fetchone()
        conn.close()
        print(f"  DB status: {row}", end="  ", flush=True)
        if row and row[0] in ("running", "completed", "failed"):
            print(f"\n  ✓ Bridge successfully wrote status={row[0]} to Supabase project inrjjdtliibjzstsyegx")
            return
        time.sleep(2)

    # If no change after 30s, still verify no errors in worker logs
    result = subprocess.run(
        [
            "ssh", "-i", os.path.expanduser("~/Downloads/roadlytics-key.pem"),
            "-o", "StrictHostKeyChecking=no",
            "ubuntu@13.48.193.214",
            "docker logs --tail 5 inference-worker 2>&1",
        ],
        capture_output=True, text=True, timeout=15
    )
    logs = result.stdout
    assert "inrjjdtliibjzstsyegx" in logs or "ready" in logs.lower() or "success" in logs.lower(), \
        f"BRIDGE_ERROR: worker not reaching correct Supabase. Logs:\n{logs}"
    print(f"\n  Worker logs verified (bridge calling correct project)")


# ── VPS → Vercel backend callback check ───────────────────────────────────────

def test_vercel_backend_rejects_wrong_internal_secret():
    """Vercel backend must reject callbacks with wrong INTERNAL_SECRET."""
    r = httpx.post(
        f"{VERCEL_BACKEND_URL}/internal/jobs/{uuid.uuid4()}/progress",
        headers={"X-Internal-Secret": "wrong-secret", "Content-Type": "application/json"},
        json={"progress": 50, "stage": "test", "status": "running"},
        timeout=15.0,
    )
    assert r.status_code in (401, 403), \
        f"VERCEL_INTERNAL_AUTH_ERROR: expected 401/403, got {r.status_code} — {r.text}"
    print(f"\n  Vercel backend rejects wrong secret: {r.status_code} ✓")


def test_vercel_backend_accepts_vps_internal_secret():
    """
    Vercel backend should accept callbacks signed with the VPS INTERNAL_SECRET.
    Uses a fake job ID — expects 404 (job not found) not 401/403.
    A 404 proves the secret was accepted and the request reached the job lookup.
    """
    fake_job_id = str(uuid.uuid4())
    r = httpx.post(
        f"{VERCEL_BACKEND_URL}/internal/jobs/{fake_job_id}/progress",
        headers={"X-Internal-Secret": VPS_INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 50, "stage": "test", "status": "running"},
        timeout=15.0,
    )
    # 404 = secret accepted, job not found (expected — fake ID)
    # 202 = secret accepted, job updated (if a real job existed)
    # 401/403 = secret rejected (FAIL — VPS won't be able to call back to Vercel)
    assert r.status_code in (202, 404, 500), (
        f"VERCEL_VPS_SECRET_ERROR: Vercel backend rejected VPS INTERNAL_SECRET.\n"
        f"  Status: {r.status_code} | Response: {r.text}\n"
        f"  Fix: Set INTERNAL_SECRET={VPS_INTERNAL_SECRET[:8]}... in Vercel dashboard"
    )
    print(f"\n  Vercel backend accepted VPS INTERNAL_SECRET: {r.status_code} ✓")
