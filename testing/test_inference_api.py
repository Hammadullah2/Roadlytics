"""
Inference API tests — targets the VPS FastAPI server via Nginx (port 80).

Endpoints:
  GET  /api/health
  POST /api/jobs/upload-and-run
  GET  /api/jobs/{job_id}
"""
import time
import uuid
import httpx
import pytest
from pathlib import Path

INFERENCE_URL = "http://13.48.193.214"
SAMPLE_TIF = Path(__file__).parent / "sample.tif"


@pytest.fixture(scope="module")
def client():
    with httpx.Client(base_url=INFERENCE_URL, timeout=600.0) as c:
        yield c


# ── Health ─────────────────────────────────────────────────────────────────────

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200, f"INFERENCE_HEALTH_ERROR: {r.status_code} — {r.text}"
    data = r.json()
    assert data.get("status") == "ok", f"INFERENCE_HEALTH_ERROR: status not ok: {data}"
    assert "device" in data, f"INFERENCE_HEALTH_ERROR: missing device field: {data}"
    print(f"\n  Inference device: {data['device']}")


def test_health_response_time(client):
    start = time.time()
    r = client.get("/api/health")
    elapsed = time.time() - start
    assert r.status_code == 200
    assert elapsed < 2.0, f"INFERENCE_PERF: health took {elapsed:.2f}s (> 2s)"
    print(f"\n  Health latency: {elapsed*1000:.0f}ms")


# ── Job status — invalid ID ────────────────────────────────────────────────────

def test_job_status_invalid_id(client):
    """Non-existent job ID should return non-200 or an error payload."""
    r = client.get("/api/jobs/nonexistent-uuid-abc123")
    # FastAPI returns 422 (validation) or 404 depending on implementation.
    # Either is acceptable — we just ensure it doesn't 500.
    assert r.status_code != 500, f"INFERENCE_ERROR: server error on invalid job ID: {r.text}"
    assert r.status_code in (404, 422, 200), f"INFERENCE_ERROR: unexpected status {r.status_code}"


# ── Upload-and-run ─────────────────────────────────────────────────────────────

def test_upload_and_run_creates_job(client):
    """Submit sample.tif, verify upload + job creation (no waiting for completion)."""
    assert SAMPLE_TIF.exists(), f"sample.tif missing at {SAMPLE_TIF}"

    backend_job_id = str(uuid.uuid4())
    size_mb = SAMPLE_TIF.stat().st_size / 1e6
    print(f"\n  Uploading {size_mb:.1f} MB ...")

    upload_start = time.time()
    with open(SAMPLE_TIF, "rb") as f:
        r = client.post(
            "/api/jobs/upload-and-run",
            files={"file": ("sample.tif", f, "image/tiff")},
            data={"region_name": "PYTEST Region", "backend_job_id": backend_job_id},
        )
    upload_elapsed = time.time() - upload_start

    assert r.status_code == 200, f"INFERENCE_UPLOAD_ERROR: {r.status_code} -- {r.text}"
    result = r.json()
    assert "job_id" in result, f"INFERENCE_UPLOAD_ERROR: no job_id in response: {result}"
    job_id = result["job_id"]
    throughput = size_mb / upload_elapsed
    print(f"  Upload: {upload_elapsed:.1f}s ({throughput:.1f} MB/s) | job_id={job_id}")

    # Verify the job is immediately queryable
    sr = client.get(f"/api/jobs/{job_id}")
    assert sr.status_code == 200, f"INFERENCE_JOB_QUERY_ERROR: {sr.status_code} -- {sr.text}"
    state = sr.json()
    assert state["job_id"] == job_id
    assert state["status"] in ("pending", "progress", "success", "failure"), \
        f"INFERENCE_STATUS_ERROR: unexpected status: {state}"
    print(f"  Initial job status: {state['status']}")


@pytest.mark.slow
def test_upload_and_run_full_pipeline(client):
    """
    Full pipeline: upload sample.tif and wait for completion.
    Marked @slow -- 621 MB takes 30+ minutes on CPU.
    Run: pytest test_inference_api.py -m slow -v -s
    """
    assert SAMPLE_TIF.exists(), f"sample.tif missing at {SAMPLE_TIF}"

    backend_job_id = str(uuid.uuid4())
    print(f"\n  Uploading {SAMPLE_TIF.stat().st_size / 1e6:.1f} MB ...")

    upload_start = time.time()
    with open(SAMPLE_TIF, "rb") as f:
        r = client.post(
            "/api/jobs/upload-and-run",
            files={"file": ("sample.tif", f, "image/tiff")},
            data={"region_name": "PYTEST Full Pipeline", "backend_job_id": backend_job_id},
        )
    upload_elapsed = time.time() - upload_start

    assert r.status_code == 200, f"INFERENCE_UPLOAD_ERROR: {r.status_code} -- {r.text}"
    job_id = r.json()["job_id"]
    print(f"  Upload: {upload_elapsed:.1f}s | job_id={job_id}")

    # Poll for completion -- 30 min cap for 621 MB on CPU
    deadline = time.time() + 1800
    while time.time() < deadline:
        sr = client.get(f"/api/jobs/{job_id}")
        assert sr.status_code == 200
        state = sr.json()
        status = state.get("status")
        pct = state.get("progress_pct", 0)
        print(f"  -> {status} ({pct}%)", end="  ", flush=True)

        if status == "success":
            assert state.get("result") is not None, f"INFERENCE_RESULT_ERROR: result is None: {state}"
            print(f"\n  Job completed successfully")
            return
        if status == "failure":
            pytest.fail(f"INFERENCE_WORKER_ERROR: job failed: {state}")
        time.sleep(10)

    pytest.fail(f"INFERENCE_TIMEOUT: job {job_id} did not complete within 30 minutes")


# ── Concurrent health checks ───────────────────────────────────────────────────

def test_concurrent_health_checks():
    """Verify the server handles multiple simultaneous requests."""
    import concurrent.futures

    def check():
        with httpx.Client(base_url=INFERENCE_URL, timeout=10.0) as c:
            r = c.get("/api/health")
            return r.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(lambda _: check(), range(5)))

    assert all(s == 200 for s in results), f"INFERENCE_CONCURRENT_ERROR: {results}"
    print(f"\n  5 concurrent health checks: all 200")
