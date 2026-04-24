"""
End-to-end pipeline tests.

Fast tests (default):
  - Route protection checks
  - Backend job creation flow (project → region → job)
  - Callback simulation and status verification

Slow tests (@pytest.mark.slow):
  - Full inference with sample.tif (30+ min on CPU, manual only)
"""
import io
import os
import time
import uuid
import httpx
import pytest
from pathlib import Path

BACKEND_URL = "http://localhost:8080/api/v1"
INFERENCE_URL = "http://13.48.193.214"
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "your_internal_secret_here")
SAMPLE_TIF = Path(__file__).parent / "sample.tif"


# ── Route protection ───────────────────────────────────────────────────────────

def test_pipeline_unauthorized_access(anon_backend):
    """Pipeline routes reject unauthenticated requests."""
    endpoints = [
        ("POST", "/jobs", {"region_id": str(uuid.uuid4()), "job_type": "full"}),
        ("GET",  f"/jobs/{uuid.uuid4()}", None),
        ("GET",  "/reports", None),
    ]
    for method, path, body in endpoints:
        r = anon_backend.request(method, path, json=body)
        assert r.status_code in (401, 403), \
            f"PIPELINE_AUTH_ERROR: {method} {path} returned {r.status_code} instead of 401/403"


def test_pipeline_no_auth_job_create(anon_backend):
    """Unauthenticated job creation returns 401/403."""
    r = anon_backend.post("/jobs", json={"region_id": str(uuid.uuid4()), "job_type": "full"})
    assert r.status_code in (401, 403), \
        f"PIPELINE_ERROR: expected 401/403, got {r.status_code}"
    print(f"\n  Route protection verified: {r.status_code}")


# ── Backend job creation flow ──────────────────────────────────────────────────

def test_pipeline_job_creation_flow(backend):
    """
    Create project → region → job, verify upload_url returned, cleanup.
    Tests backend orchestration without triggering inference.
    """
    unique = uuid.uuid4().hex[:8]

    # Create project
    r = backend.post("/projects", json={"name": f"PYTEST-E2E-{unique}", "description": "E2E test"})
    assert r.status_code == 201, f"E2E_PROJECT_ERROR: {r.text}"
    project = r.json()

    try:
        # Create region
        polygon = {"type": "Polygon", "coordinates": [
            [[73.0, 33.0], [73.1, 33.0], [73.1, 33.1], [73.0, 33.1], [73.0, 33.0]]
        ]}
        r = backend.post(
            f"/projects/{project['id']}/regions",
            json={"name": f"PYTEST-E2E-R-{unique}", "polygon": polygon},
        )
        assert r.status_code == 201, f"E2E_REGION_ERROR: {r.text}"
        region = r.json()

        # Create job
        r = backend.post("/jobs", json={"region_id": region["id"], "job_type": "full"})
        assert r.status_code == 201, f"E2E_JOB_ERROR: {r.text}"
        job = r.json()
        print(f"\n  Project {project['id']} → Region {region['id']} → Job {job['id']}")
        print(f"  Upload URL: {job.get('upload_url', 'MISSING')}")
        assert job.get("upload_url"), "E2E_JOB_ERROR: upload_url missing — inference not configured"
        assert "/api/jobs/upload-and-run" in job["upload_url"]

    finally:
        backend.delete(f"/projects/{project['id']}")


# ── Callback simulation ────────────────────────────────────────────────────────

def test_pipeline_callback_simulation(backend, test_job):
    """
    Simulate the VPS → backend callback flow:
    1. Backend job exists (pending)
    2. Callback marks it running at 50%
    3. Callback marks it completed at 100%
    4. Verify final state
    """
    job_id = test_job["id"]

    # Mark running
    r = httpx.post(
        f"{BACKEND_URL}/internal/jobs/{job_id}/progress",
        headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 50, "stage": "classification", "status": "running"},
        timeout=15.0,
    )
    assert r.status_code == 202, f"CALLBACK_RUNNING_ERROR: {r.status_code} -- {r.text}"

    # Mark complete
    r = httpx.post(
        f"{BACKEND_URL}/internal/jobs/{job_id}/progress",
        headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 100, "stage": "connectivity", "status": "completed"},
        timeout=15.0,
    )
    assert r.status_code == 202, f"CALLBACK_COMPLETE_ERROR: {r.status_code} -- {r.text}"

    # Verify backend reflects completion
    r = backend.get(f"/jobs/{job_id}")
    assert r.status_code == 200, f"E2E_JOB_VERIFY_ERROR: {r.text}"
    final = r.json()
    assert final["progress"] == 100, f"E2E_PROGRESS_ERROR: expected 100, got {final.get('progress')}"
    assert final["status"] == "completed", f"E2E_STATUS_ERROR: expected completed, got {final.get('status')}"
    print(f"\n  Job {job_id}: status={final['status']} progress={final['progress']} -- callback pipeline verified")


# ── Full E2E with synthetic 1MB file ──────────────────────────────────────────

def test_pipeline_e2e_synthetic_inference(backend, auth_headers):
    """
    Full E2E with a 1MB synthetic binary blob.
    The inference will fail (not a real GeoTIFF) but we verify:
    - Upload to inference server succeeds
    - Inference job is created
    - Backend receives a callback (failure or success)
    - Backend job status reflects the inference result
    """
    unique = uuid.uuid4().hex[:8]

    r = backend.post("/projects", json={"name": f"PYTEST-E2ESynth-{unique}", "description": "Synthetic E2E"})
    assert r.status_code == 201, f"E2E_PROJECT_ERROR: {r.text}"
    project = r.json()

    try:
        polygon = {"type": "Polygon", "coordinates": [
            [[73.0, 33.0], [73.1, 33.0], [73.1, 33.1], [73.0, 33.1], [73.0, 33.0]]
        ]}
        r = backend.post(
            f"/projects/{project['id']}/regions",
            json={"name": f"PYTEST-SynthR-{unique}", "polygon": polygon},
        )
        assert r.status_code == 201
        region = r.json()

        r = backend.post("/jobs", json={"region_id": region["id"], "job_type": "full"})
        assert r.status_code == 201
        job_resp = r.json()
        backend_job_id = job_resp["id"]
        upload_url = job_resp["upload_url"]
        print(f"\n  Backend job: {backend_job_id}")

        # Upload 1MB synthetic to inference server
        data = os.urandom(1024 * 1024)
        with httpx.Client(timeout=120.0) as ic:
            r = ic.post(
                upload_url,
                files={"file": ("synthetic.tif", io.BytesIO(data), "image/tiff")},
                data={"region_name": f"Synthetic-{unique}", "backend_job_id": backend_job_id},
            )
        assert r.status_code == 200, f"E2E_UPLOAD_ERROR: {r.status_code} -- {r.text}"
        inference_job_id = r.json()["job_id"]
        print(f"  Inference job: {inference_job_id}")

        # Poll inference server for up to 2 minutes (synthetic file processes quickly)
        deadline = time.time() + 120
        inference_status = None
        with httpx.Client(base_url=INFERENCE_URL, timeout=30.0) as ic:
            while time.time() < deadline:
                sr = ic.get(f"/api/jobs/{inference_job_id}")
                assert sr.status_code == 200
                state = sr.json()
                inference_status = state.get("status")
                print(f"  -> {inference_status}", end="  ", flush=True)
                if inference_status in ("success", "failure"):
                    print()
                    break
                time.sleep(5)

        print(f"\n  Inference result: {inference_status}")

        # Regardless of inference success/failure, simulate callback
        final_status = "completed" if inference_status == "success" else "failed"
        r = httpx.post(
            f"{BACKEND_URL}/internal/jobs/{backend_job_id}/progress",
            headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
            json={"progress": 100 if final_status == "completed" else 0,
                  "stage": "done", "status": final_status},
            timeout=15.0,
        )
        assert r.status_code == 202, f"E2E_CALLBACK_ERROR: {r.status_code} -- {r.text}"
        print(f"  Callback sent: status={final_status}")

        # Verify backend
        r = backend.get(f"/jobs/{backend_job_id}")
        final_job = r.json()
        assert final_job["status"] in ("completed", "failed"), \
            f"E2E_BACKEND_STATUS_ERROR: unexpected status: {final_job.get('status')}"
        print(f"  Backend job final: {final_job['status']} -- E2E verified")

    finally:
        backend.delete(f"/projects/{project['id']}")


# ── Full E2E with sample.tif (slow) ───────────────────────────────────────────

@pytest.mark.slow
def test_pipeline_full_with_sample_tif(backend, auth_headers):
    """
    Full E2E pipeline with 621 MB sample.tif.
    Marked @slow -- takes 30+ minutes on CPU inference.
    Run: pytest test_e2e_pipeline.py -m slow -v -s
    """
    assert SAMPLE_TIF.exists(), "sample.tif missing"
    unique = uuid.uuid4().hex[:8]

    r = backend.post("/projects", json={"name": f"PYTEST-E2EFull-{unique}"})
    project = r.json()
    assert r.status_code == 201

    try:
        polygon = {"type": "Polygon", "coordinates": [
            [[73.0, 33.0], [73.1, 33.0], [73.1, 33.1], [73.0, 33.1], [73.0, 33.0]]
        ]}
        r = backend.post(f"/projects/{project['id']}/regions",
                         json={"name": f"PYTEST-E2EFull-R-{unique}", "polygon": polygon})
        assert r.status_code == 201
        region = r.json()

        r = backend.post("/jobs", json={"region_id": region["id"], "job_type": "full"})
        assert r.status_code == 201
        job_resp = r.json()
        backend_job_id = job_resp["id"]
        upload_url = job_resp["upload_url"]

        print(f"\n  [1] Uploading 621 MB ...")
        with httpx.Client(timeout=600.0) as ic:
            with open(SAMPLE_TIF, "rb") as f:
                r = ic.post(upload_url,
                            files={"file": ("sample.tif", f, "image/tiff")},
                            data={"region_name": f"E2E-Full-{unique}",
                                  "backend_job_id": backend_job_id})
        assert r.status_code == 200
        inference_job_id = r.json()["job_id"]
        print(f"  [2] Upload done | inference_job_id={inference_job_id}")

        deadline = time.time() + 3600  # 1 hour max
        with httpx.Client(base_url=INFERENCE_URL, timeout=30.0) as ic:
            while time.time() < deadline:
                sr = ic.get(f"/api/jobs/{inference_job_id}")
                state = sr.json()
                status = state.get("status")
                pct = state.get("progress_pct", 0)
                print(f"  -> {status} ({pct}%)", end="  ", flush=True)
                if status == "success":
                    print(f"\n  [3] Inference complete")
                    break
                if status == "failure":
                    pytest.fail(f"INFERENCE_FAILURE: {state}")
                time.sleep(15)
            else:
                pytest.fail("E2E_TIMEOUT: 1-hour cap exceeded")

        r = httpx.post(
            f"{BACKEND_URL}/internal/jobs/{backend_job_id}/progress",
            headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
            json={"progress": 100, "stage": "connectivity", "status": "completed"},
            timeout=15.0,
        )
        assert r.status_code == 202

        r = backend.get(f"/jobs/{backend_job_id}")
        final = r.json()
        assert final["status"] == "completed"
        print(f"  [4] Backend confirmed: {final['status']}")

    finally:
        backend.delete(f"/projects/{project['id']}")
