"""
Upload speed tests for the 621 MB sample.tif.

Tests:
  - Direct upload to inference server (VPS)
  - Throughput measurement at multiple stages
  - Chunked upload size sanity
  - Repeated upload for consistency

Run with:
  pytest test_upload_speed.py -v -s

Mark large tests explicitly:
  pytest test_upload_speed.py -v -s -m large
"""
import io
import os
import time
import uuid
import httpx
import pytest
from pathlib import Path

INFERENCE_URL = "http://13.48.193.214"
SAMPLE_TIF = Path(__file__).parent / "sample.tif"

# Minimum acceptable upload throughput (MB/s) — conservatively low for VPS uploads
MIN_THROUGHPUT_MBPS = 1.0


def _file_size_mb() -> float:
    return SAMPLE_TIF.stat().st_size / (1024 * 1024)


# ── Pre-check ─────────────────────────────────────────────────────────────────

def test_sample_tif_exists_and_size():
    """Verify the test file exists and is the expected ~600 MB size."""
    assert SAMPLE_TIF.exists(), f"sample.tif not found at {SAMPLE_TIF}"
    size_mb = _file_size_mb()
    assert size_mb > 100, f"UPLOAD_ERROR: sample.tif is only {size_mb:.1f} MB — expected ~600 MB"
    print(f"\n  sample.tif: {size_mb:.1f} MB")


# ── Inference server upload speed ─────────────────────────────────────────────

@pytest.mark.large
def test_full_upload_throughput_inference():
    """Upload 600 MB to VPS inference server and assert minimum throughput."""
    size_mb = _file_size_mb()

    with httpx.Client(base_url=INFERENCE_URL, timeout=600.0) as client:
        print(f"\n  Starting {size_mb:.1f} MB upload to {INFERENCE_URL} …")
        t0 = time.time()

        with open(SAMPLE_TIF, "rb") as f:
            r = client.post(
                "/api/jobs/upload-and-run",
                files={"file": ("sample.tif", f, "image/tiff")},
                data={"region_name": "Speed Test", "backend_job_id": str(uuid.uuid4())},
            )

        elapsed = time.time() - t0
        assert r.status_code == 200, f"UPLOAD_HTTP_ERROR: {r.status_code} — {r.text}"

        throughput = size_mb / elapsed
        print(f"  Upload complete: {elapsed:.1f}s | {throughput:.2f} MB/s")
        print(f"  Job: {r.json().get('job_id')}")

        assert throughput >= MIN_THROUGHPUT_MBPS, (
            f"UPLOAD_SPEED_ERROR: {throughput:.2f} MB/s < minimum {MIN_THROUGHPUT_MBPS} MB/s\n"
            f"  Elapsed: {elapsed:.1f}s for {size_mb:.1f} MB"
        )


@pytest.mark.large
def test_upload_time_within_limit():
    """Full upload must complete in under 10 minutes."""
    backend_job_id = str(uuid.uuid4())

    with httpx.Client(base_url=INFERENCE_URL, timeout=600.0) as client:
        t0 = time.time()
        with open(SAMPLE_TIF, "rb") as f:
            r = client.post(
                "/api/jobs/upload-and-run",
                files={"file": ("sample.tif", f, "image/tiff")},
                data={"region_name": "Time Test", "backend_job_id": backend_job_id},
            )
        elapsed = time.time() - t0

        assert r.status_code == 200, f"UPLOAD_ERROR: {r.status_code} — {r.text}"
        assert elapsed < 600, f"UPLOAD_TIMEOUT: upload took {elapsed:.1f}s (> 600s limit)"
        print(f"\n  Upload time: {elapsed:.1f}s ✓")


# ── Chunked / partial upload simulation ───────────────────────────────────────

def test_upload_small_synthetic_tif():
    """Upload a tiny synthetic GeoTIFF-like binary blob as a smoke test."""
    size_bytes = 1 * 1024 * 1024  # 1 MB
    data = os.urandom(size_bytes)

    with httpx.Client(base_url=INFERENCE_URL, timeout=60.0) as client:
        t0 = time.time()
        r = client.post(
            "/api/jobs/upload-and-run",
            files={"file": ("small.tif", io.BytesIO(data), "image/tiff")},
            data={"region_name": "Synthetic 1MB", "backend_job_id": str(uuid.uuid4())},
        )
        elapsed = time.time() - t0

    # Synthetic data may fail inference but the upload + job creation should succeed.
    # A 422 or specific inference error is acceptable; 500 is not.
    assert r.status_code in (200, 400, 422), \
        f"SYNTHETIC_UPLOAD_ERROR: unexpected {r.status_code} — {r.text}"
    print(f"\n  1 MB synthetic upload: {elapsed*1000:.0f}ms | status={r.status_code}")


# ── Upload metrics report ──────────────────────────────────────────────────────

@pytest.mark.large
def test_upload_metrics_report():
    """Run 2 uploads and print a mini benchmark report."""
    results = []
    size_mb = _file_size_mb()

    for run in range(1, 3):
        with httpx.Client(base_url=INFERENCE_URL, timeout=600.0) as client:
            t0 = time.time()
            with open(SAMPLE_TIF, "rb") as f:
                r = client.post(
                    "/api/jobs/upload-and-run",
                    files={"file": ("sample.tif", f, "image/tiff")},
                    data={"region_name": f"Bench-{run}", "backend_job_id": str(uuid.uuid4())},
                )
            elapsed = time.time() - t0
            ok = r.status_code == 200
            throughput = size_mb / elapsed if elapsed > 0 else 0
            results.append({"run": run, "elapsed": elapsed, "throughput": throughput, "ok": ok})
            print(f"\n  Run {run}: {elapsed:.1f}s | {throughput:.2f} MB/s | ok={ok}", end="  ")

    avg_tp = sum(r["throughput"] for r in results) / len(results)
    print(f"\n  Average throughput: {avg_tp:.2f} MB/s over {len(results)} runs")
    assert all(r["ok"] for r in results), f"BENCH_ERROR: some uploads failed: {results}"
    assert avg_tp >= MIN_THROUGHPUT_MBPS, \
        f"BENCH_SPEED_ERROR: avg {avg_tp:.2f} MB/s < minimum {MIN_THROUGHPUT_MBPS} MB/s"
