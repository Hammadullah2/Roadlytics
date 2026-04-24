"""
Go backend API tests — targets the local backend at http://localhost:8080.

Covers:
  - Health endpoint (no auth)
  - Auth: profile, update
  - Projects: CRUD
  - Regions: CRUD under project
  - Jobs: create, get, status, progress
  - Internal callback: progress update
  - Unauthorized access: 401/403 enforcement
  - Vercel deployment health check
"""
import os
import uuid
import httpx
import pytest

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080/api/v1")
VERCEL_URL = "https://backend-ivory-omega.vercel.app/api/v1"
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "your_internal_secret_here")


# ── Health (no auth required) ──────────────────────────────────────────────────

def test_backend_health(backend):
    r = backend.get("/health")
    assert r.status_code == 200, f"HEALTH_ERROR: {r.status_code} — {r.text}"
    data = r.json()
    assert data["status"] == "ok", f"HEALTH_ERROR: status not ok: {data}"
    checks = data["checks"]
    assert checks["database"] == "connected", f"HEALTH_ERROR: DB not connected: {checks}"
    assert checks["inference_server"] == "connected", f"HEALTH_ERROR: Inference not connected: {checks}"
    print(f"\n  Health: {data['status']} | checks: {checks}")


def test_backend_health_vercel():
    """Vercel deployment health should also be up."""
    r = httpx.get(f"{VERCEL_URL}/health", timeout=15.0)
    assert r.status_code == 200, f"VERCEL_HEALTH_ERROR: {r.status_code} — {r.text}"
    data = r.json()
    assert data["status"] in ("ok", "degraded"), f"VERCEL_HEALTH_ERROR: {data}"
    print(f"\n  Vercel health: {data['status']}")


# ── Auth: profile ──────────────────────────────────────────────────────────────

def test_get_profile(backend):
    r = backend.get("/auth/profile")
    assert r.status_code == 200, f"PROFILE_ERROR: {r.text}"
    data = r.json()["data"]
    assert data["email"] == "test_agent@roadlytics.test"
    assert data["approval_status"] == "approved"
    print(f"\n  Profile: {data['email']} | role={data['role']} | status={data['approval_status']}")


def test_post_profile_alias(backend):
    """POST /auth/profile is an alias for GET."""
    r = backend.post("/auth/profile")
    assert r.status_code == 200, f"PROFILE_POST_ERROR: {r.text}"
    assert r.json()["data"]["email"] == "test_agent@roadlytics.test"


def test_register_conflict(backend):
    """Re-registering existing profile returns 409 Conflict."""
    r = backend.post("/auth/register", json={"name": "Test Agent"})
    assert r.status_code == 409, f"REGISTER_CONFLICT_ERROR: expected 409, got {r.status_code} — {r.text}"


def test_register_missing_name(backend):
    r = backend.post("/auth/register", json={})
    assert r.status_code in (400, 409), f"REGISTER_VALIDATION_ERROR: {r.status_code} — {r.text}"


# ── Unauthorized access ────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,path,body", [
    ("GET",  "/auth/profile",  None),
    ("GET",  "/projects",      None),
    ("POST", "/projects",      {"name": "x"}),
    ("GET",  "/jobs/fake-id",  None),
])
def test_unauthorized(anon_backend, method, path, body):
    r = anon_backend.request(method, path, json=body)
    assert r.status_code in (401, 403), \
        f"AUTH_ERROR: {method} {path} expected 401/403, got {r.status_code} — {r.text}"


def test_internal_endpoint_no_secret(anon_backend):
    """Callback without INTERNAL_SECRET header must be rejected."""
    r = anon_backend.post(
        "/internal/jobs/fake-id/progress",
        json={"progress": 50, "stage": "segmentation", "status": "running"},
    )
    assert r.status_code in (401, 403), \
        f"INTERNAL_AUTH_ERROR: expected 401/403, got {r.status_code} — {r.text}"


# ── Projects CRUD ──────────────────────────────────────────────────────────────

def test_project_list_empty_or_existing(backend):
    r = backend.get("/projects")
    assert r.status_code == 200, f"PROJECT_LIST_ERROR: {r.text}"
    assert isinstance(r.json(), list), f"PROJECT_LIST_FORMAT_ERROR: expected list: {r.json()}"


def test_project_create_missing_name(backend):
    r = backend.post("/projects", json={"description": "no name"})
    assert r.status_code == 400, f"PROJECT_VALIDATION_ERROR: {r.status_code} — {r.text}"


def test_project_crud(backend):
    unique = uuid.uuid4().hex[:8]
    name = f"PYTEST-Project-{unique}"

    # Create
    r = backend.post("/projects", json={"name": name, "description": "crud test"})
    assert r.status_code == 201, f"PROJECT_CREATE_ERROR: {r.text}"
    proj = r.json()
    assert proj["name"] == name
    proj_id = proj["id"]
    print(f"\n  Created project: {proj_id}")

    # Get
    r = backend.get(f"/projects/{proj_id}")
    assert r.status_code == 200, f"PROJECT_GET_ERROR: {r.text}"
    assert r.json()["id"] == proj_id

    # List includes new project
    r = backend.get("/projects")
    ids = [p["id"] for p in r.json()]
    assert proj_id in ids, "PROJECT_LIST_ERROR: created project not in list"

    # Update (PATCH)
    new_name = f"PYTEST-Updated-{unique}"
    r = backend.patch(f"/projects/{proj_id}", json={"name": new_name})
    assert r.status_code == 200, f"PROJECT_UPDATE_ERROR: {r.text}"
    assert r.json()["name"] == new_name

    # Update (PUT)
    r = backend.put(f"/projects/{proj_id}", json={"name": new_name, "description": "updated"})
    assert r.status_code == 200, f"PROJECT_PUT_ERROR: {r.text}"

    # Delete
    r = backend.delete(f"/projects/{proj_id}")
    assert r.status_code == 200, f"PROJECT_DELETE_ERROR: {r.text}"

    # Confirm deleted
    r = backend.get(f"/projects/{proj_id}")
    assert r.status_code == 404, f"PROJECT_GHOST_ERROR: project still accessible after delete"


def test_project_not_found(backend):
    r = backend.get(f"/projects/{uuid.uuid4()}")
    assert r.status_code == 404, f"PROJECT_404_ERROR: {r.status_code}"


# ── Regions CRUD ───────────────────────────────────────────────────────────────

def test_region_list(backend, test_project):
    r = backend.get(f"/projects/{test_project['id']}/regions")
    assert r.status_code == 200, f"REGION_LIST_ERROR: {r.text}"
    assert isinstance(r.json(), list)


def test_region_create_missing_name(backend, test_project):
    polygon = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    r = backend.post(
        f"/projects/{test_project['id']}/regions",
        json={"polygon": polygon},
    )
    assert r.status_code == 400, f"REGION_VALIDATION_ERROR: {r.status_code}"


def test_region_create_missing_polygon(backend, test_project):
    r = backend.post(
        f"/projects/{test_project['id']}/regions",
        json={"name": "PYTEST-NoPolygon"},
    )
    assert r.status_code == 400, f"REGION_VALIDATION_ERROR: {r.status_code}"


def test_region_crud(backend, test_project):
    unique = uuid.uuid4().hex[:8]
    polygon = {
        "type": "Polygon",
        "coordinates": [[[73.0, 33.0], [73.1, 33.0], [73.1, 33.1], [73.0, 33.1], [73.0, 33.0]]]
    }

    # Create
    r = backend.post(
        f"/projects/{test_project['id']}/regions",
        json={"name": f"PYTEST-Region-{unique}", "polygon": polygon},
    )
    assert r.status_code == 201, f"REGION_CREATE_ERROR: {r.text}"
    region = r.json()
    rid = region["id"]
    print(f"\n  Created region: {rid}")

    # Get via project path
    r = backend.get(f"/projects/{test_project['id']}/regions/{rid}")
    assert r.status_code == 200, f"REGION_GET_ERROR: {r.text}"

    # Get by ID shortcut
    r = backend.get(f"/regions/{rid}")
    assert r.status_code == 200, f"REGION_GETBYID_ERROR: {r.text}"
    assert r.json()["id"] == rid

    # Delete by ID
    r = backend.delete(f"/regions/{rid}")
    assert r.status_code == 200, f"REGION_DELETE_ERROR: {r.text}"

    # Confirm deleted
    r = backend.get(f"/regions/{rid}")
    assert r.status_code == 404, f"REGION_GHOST_ERROR: region still accessible after delete"


# ── Jobs ───────────────────────────────────────────────────────────────────────

def test_job_create(backend, test_region):
    r = backend.post("/jobs", json={"region_id": test_region["id"], "job_type": "full"})
    assert r.status_code == 201, f"JOB_CREATE_ERROR: {r.text}"
    job = r.json()
    assert "id" in job, f"JOB_CREATE_ERROR: no id in response: {job}"
    assert "upload_url" in job, f"JOB_CREATE_ERROR: no upload_url in response: {job}"
    assert "/api/jobs/upload-and-run" in job["upload_url"], \
        f"JOB_CREATE_ERROR: upload_url missing inference path: {job['upload_url']}"
    print(f"\n  Job created: {job['id']} | upload_url: {job['upload_url']}")


def test_job_create_missing_region(backend):
    r = backend.post("/jobs", json={"job_type": "full"})
    assert r.status_code == 400, f"JOB_VALIDATION_ERROR: {r.status_code}"


def test_job_create_invalid_region(backend):
    r = backend.post("/jobs", json={"region_id": str(uuid.uuid4()), "job_type": "full"})
    assert r.status_code in (400, 404, 500), f"JOB_INVALID_REGION_ERROR: {r.status_code}"


def test_job_get(backend, test_job):
    r = backend.get(f"/jobs/{test_job['id']}")
    assert r.status_code == 200, f"JOB_GET_ERROR: {r.text}"
    job = r.json()
    assert job["id"] == test_job["id"]
    print(f"\n  Job status: {job.get('status')} | progress: {job.get('progress')}")


def test_job_status_endpoint(backend, test_job):
    r = backend.get(f"/jobs/{test_job['id']}/status")
    assert r.status_code == 200, f"JOB_STATUS_ERROR: {r.text}"


def test_job_progress_endpoint(backend, test_job):
    r = backend.get(f"/jobs/{test_job['id']}/progress")
    assert r.status_code == 200, f"JOB_PROGRESS_ERROR: {r.text}"


def test_jobs_list_by_region(backend, test_region, test_job):
    r = backend.get(f"/regions/{test_region['id']}/jobs")
    assert r.status_code == 200, f"JOB_LIST_ERROR: {r.text}"
    jobs = r.json()
    assert isinstance(jobs, list)
    job_ids = [j["id"] for j in jobs]
    assert test_job["id"] in job_ids, f"JOB_LIST_ERROR: created job not in region job list"


def test_job_not_found(backend):
    r = backend.get(f"/jobs/{uuid.uuid4()}")
    assert r.status_code == 404, f"JOB_404_ERROR: {r.status_code}"


def test_create_job_for_region(backend, test_region):
    """POST /regions/{id}/jobs shortcut."""
    r = backend.post(f"/regions/{test_region['id']}/jobs", json={"job_type": "full"})
    assert r.status_code == 201, f"JOB_CREATE_REGION_ERROR: {r.text}"
    assert "id" in r.json()


# ── Internal callback ──────────────────────────────────────────────────────────

def test_callback_update_progress(backend, test_job):
    job_id = test_job["id"]
    r = httpx.post(
        f"{BACKEND_URL}/internal/jobs/{job_id}/progress",
        headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 42, "stage": "segmentation", "status": "running"},
        timeout=15.0,
    )
    assert r.status_code == 202, f"CALLBACK_ERROR: {r.status_code} — {r.text}"
    data = r.json()
    assert data["progress"] == 42
    assert data["status"] == "running"
    print(f"\n  Callback accepted: progress={data['progress']} stage={data['stage']}")


def test_callback_invalid_progress(backend, test_job):
    job_id = test_job["id"]
    r = httpx.post(
        f"{BACKEND_URL}/internal/jobs/{job_id}/progress",
        headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 150, "stage": "segmentation", "status": "running"},
        timeout=15.0,
    )
    assert r.status_code == 400, f"CALLBACK_VALIDATION_ERROR: expected 400, got {r.status_code}"


def test_callback_invalid_status(backend, test_job):
    job_id = test_job["id"]
    r = httpx.post(
        f"{BACKEND_URL}/internal/jobs/{job_id}/progress",
        headers={"X-Internal-Secret": INTERNAL_SECRET, "Content-Type": "application/json"},
        json={"progress": 50, "stage": "segmentation", "status": "bogus"},
        timeout=15.0,
    )
    assert r.status_code == 400, f"CALLBACK_STATUS_VALIDATION_ERROR: expected 400, got {r.status_code}"


# ── Results (job must be completed for real data; verify endpoint exists) ───────

def test_results_endpoint_exists(backend, test_job):
    """Results endpoints return 200 (empty) or 404 for a non-completed job."""
    r = backend.get(f"/jobs/{test_job['id']}/results")
    assert r.status_code in (200, 404), f"RESULTS_ERROR: unexpected {r.status_code} — {r.text}"


# ── Reports ────────────────────────────────────────────────────────────────────

def test_reports_list(backend):
    r = backend.get("/reports")
    assert r.status_code == 200, f"REPORTS_LIST_ERROR: {r.text}"
    assert isinstance(r.json(), list)
