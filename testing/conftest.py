"""
Shared pytest fixtures for Roadlytics backend + inference API tests.

Auth flow:
  - Supabase user: test_agent@roadlytics.test (pre-created, approved)
  - JWT: HS256 minted with local SUPABASE_JWT_SECRET (raw string from .env)
  - Backend: local Go server on http://localhost:8080
"""
import os
import time
import uuid
import psycopg2
import pytest
import httpx
import jwt

# ── Configuration ─────────────────────────────────────────────────────────────

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080/api/v1")
INFERENCE_URL = os.getenv("INFERENCE_URL", "http://13.48.193.214")

# From .env — raw string, NOT base64-decoded. Go does []byte(string) = UTF-8 bytes.
JWT_SECRET = os.getenv(
    "SUPABASE_JWT_SECRET",
    "hsIlGvYSxjWpNMYm2UzC589iafn9RDiv0ekPVWUS2EGMeLVZ3DVmXkBRyoQp8IfWovxeJfGM4ZrNBap+b4mtpw==",
)

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://inrjjdtliibjzstsyegx.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlucmpqZHRsaWlianpzdHN5ZWd4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjI3NzYwNCwiZXhwIjoyMDkxODUzNjA0fQ.yq07iZuZ9uAoCo_g_CMOSwJdIRSpQ8gVZpT3p6yX4R4",
)
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlucmpqZHRsaWlianpzdHN5ZWd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzc2MDQsImV4cCI6MjA5MTg1MzYwNH0.TTVhFD3GPA-aq4Bc3qsPAzw5KVbyZpzzcu7HwtgTif0",
)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.inrjjdtliibjzstsyegx:IRqe1JHxIwRIR9XS@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
)
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "your_internal_secret_here")

# Test user (pre-created Supabase user, approved in DB)
TEST_USER_ID = "dcf68b28-5143-4e27-85da-45c1f81a1930"
TEST_USER_EMAIL = "test_agent@roadlytics.test"
TEST_PREFIX = "PYTEST-"  # prefix for all test data so cleanup is safe


def mint_token(user_id: str = TEST_USER_ID, email: str = TEST_USER_EMAIL, ttl: int = 3600) -> str:
    """Mint a fresh HS256 JWT valid for ttl seconds."""
    now = int(time.time())
    claims = {
        "iss": f"{SUPABASE_URL}/auth/v1",
        "sub": user_id,
        "aud": "authenticated",
        "exp": now + ttl,
        "iat": now,
        "email": email,
        "role": "authenticated",
        "aal": "aal1",
    }
    return jwt.encode(claims, JWT_SECRET, algorithm="HS256")


def db_connect():
    return psycopg2.connect(DATABASE_URL)


# ── Session-scoped fixtures ────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def token() -> str:
    """Fresh JWT for the test user (1-hour TTL; regenerated each session)."""
    return mint_token()


@pytest.fixture(scope="session")
def auth_headers(token) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def backend(auth_headers):
    """httpx client wired to local backend, auto-auth, 30 s timeout."""
    with httpx.Client(base_url=BACKEND_URL, headers=auth_headers, timeout=30.0) as c:
        # Verify backend is reachable before tests run.
        r = c.get("/health")
        assert r.status_code == 200, f"Backend not reachable at {BACKEND_URL}: {r.text}"
        yield c


@pytest.fixture(scope="session")
def inference():
    """httpx client wired to the VPS inference server, long timeout for large uploads."""
    with httpx.Client(base_url=INFERENCE_URL, timeout=600.0) as c:
        r = c.get("/api/health")
        assert r.status_code == 200, f"Inference server not reachable at {INFERENCE_URL}: {r.text}"
        yield c


@pytest.fixture(scope="session")
def anon_backend():
    """Unauthenticated httpx client for testing 401/403 responses."""
    with httpx.Client(base_url=BACKEND_URL, timeout=15.0) as c:
        yield c


# ── Session-scoped test project / region / job ─────────────────────────────────

@pytest.fixture(scope="session")
def test_project(backend):
    """Create a test project; delete it after the session."""
    r = backend.post("/projects", json={"name": f"{TEST_PREFIX}Project", "description": "Automated test project"})
    assert r.status_code == 201, f"Failed to create test project: {r.text}"
    project = r.json()
    yield project
    # Cleanup
    backend.delete(f"/projects/{project['id']}")


@pytest.fixture(scope="session")
def test_region(backend, test_project):
    """Create a test region inside the test project; delete after session."""
    polygon = {
        "type": "Polygon",
        "coordinates": [[[73.0, 33.0], [73.1, 33.0], [73.1, 33.1], [73.0, 33.1], [73.0, 33.0]]]
    }
    r = backend.post(
        f"/projects/{test_project['id']}/regions",
        json={"name": f"{TEST_PREFIX}Region", "polygon": polygon},
    )
    assert r.status_code == 201, f"Failed to create test region: {r.text}"
    region = r.json()
    yield region
    # Region deleted when project is deleted (cascade), but explicit cleanup is safe.
    backend.delete(f"/regions/{region['id']}")


@pytest.fixture(scope="session")
def test_job(backend, test_region):
    """Create a test job for the test region; does not clean up (job status is immutable)."""
    r = backend.post(
        "/jobs",
        json={"region_id": test_region["id"], "job_type": "full"},
    )
    assert r.status_code == 201, f"Failed to create test job: {r.text}"
    return r.json()
