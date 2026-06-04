from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from backend.app.services.jobs import JobProcessor


class FakeRepository:
    def __init__(self) -> None:
        self.artifacts = []
        self.events = []
        self.jobs = {
            "job-1": {
                "id": "job-1",
                "input_blob_path": "uploads/upload-1/input.tif",
                "project_name": "Modal Test",
                "description": "Remote execution test",
                "segmenter": "deeplab",
                "classifier": "efficientnet",
            }
        }
        self.analytics = None
        self.updated = []

    def get_job(self, job_id: str):
        return self.jobs.get(job_id)

    def update_job(self, job_id: str, **fields):
        self.updated.append((job_id, fields))
        self.jobs[job_id].update(fields)
        return self.jobs[job_id]

    def add_event(self, job_id: str, stage: str, message: str):
        self.events.append({"job_id": job_id, "stage": stage, "message": message})

    def list_events(self, job_id: str):
        return [event for event in self.events if event["job_id"] == job_id]

    def add_artifact(self, payload):
        self.artifacts.append(payload)
        return payload

    def clear_artifacts(self, job_id: str):
        self.artifacts.clear()

    def upsert_analytics(self, job_id: str, summary):
        self.analytics = {"job_id": job_id, "summary": summary}


class FakeStorage:
    def exists(self, blob_path: str) -> bool:
        return False


def test_register_remote_artifact_preserves_blob_metadata(tmp_path: Path):
    settings = SimpleNamespace(work_root=tmp_path, storage_mode="azure")
    repository = FakeRepository()
    processor = JobProcessor(settings, repository, FakeStorage())

    processor._register_remote_artifact(
        "job-1",
        {
            "artifact_type": "combined",
            "label": "Combined Condition Mask",
            "layer_name": "combined",
            "blob_path": "jobs/job-1/rasters/combined.tif",
            "content_type": "image/tiff",
            "size_bytes": 123,
            "bounds": [1.0, 2.0, 3.0, 4.0],
            "metadata": {"kind": "raster"},
            "is_download": True,
            "display_order": 60,
        },
    )

    assert len(repository.artifacts) == 1
    artifact = repository.artifacts[0]
    assert artifact["job_id"] == "job-1"
    assert artifact["blob_path"] == "jobs/job-1/rasters/combined.tif"
    assert artifact["local_path"] is None
    assert artifact["bounds"] == [1.0, 2.0, 3.0, 4.0]
    assert artifact["metadata"] == {"kind": "raster"}
