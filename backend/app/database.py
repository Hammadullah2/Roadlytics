"""SQLite repository for job, artifact, and analytics metadata."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


def _json_dump(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


def _json_load(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    return json.loads(value)


class Repository:
    def __init__(self, database_path: Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        schema = """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            upload_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            segmenter TEXT NOT NULL,
            classifier TEXT NOT NULL,
            input_blob_path TEXT NOT NULL,
            input_local_path TEXT,
            status TEXT NOT NULL,
            stage TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            bounds_json TEXT,
            raster_meta_json TEXT
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL,
            label TEXT NOT NULL,
            layer_name TEXT,
            blob_path TEXT NOT NULL,
            local_path TEXT,
            content_type TEXT NOT NULL,
            size_bytes INTEGER,
            bounds_json TEXT,
            metadata_json TEXT,
            is_download INTEGER NOT NULL DEFAULT 1,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        );

        CREATE TABLE IF NOT EXISTS job_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        );

        CREATE TABLE IF NOT EXISTS analytics_snapshots (
            job_id TEXT PRIMARY KEY,
            summary_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id)
        );

        CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_artifacts_job_id ON artifacts(job_id);
        CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id);
        """
        with self._lock, self.connect() as connection:
            connection.executescript(schema)

    def _row_to_job(self, row: sqlite3.Row | None) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        data = dict(row)
        data["bounds"] = _json_load(data.pop("bounds_json"), None)
        data["raster_meta"] = _json_load(data.pop("raster_meta_json"), {})
        return data

    def _row_to_artifact(self, row: sqlite3.Row) -> Dict[str, Any]:
        data = dict(row)
        data["bounds"] = _json_load(data.pop("bounds_json"), None)
        data["metadata"] = _json_load(data.pop("metadata_json"), {})
        data["is_download"] = bool(data["is_download"])
        return data

    def create_job(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs (
                    id, upload_id, project_name, description, segmenter, classifier,
                    input_blob_path, input_local_path, status, stage, progress,
                    error_message, created_at, updated_at, started_at, completed_at,
                    bounds_json, raster_meta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["upload_id"],
                    payload["project_name"],
                    payload.get("description", ""),
                    payload["segmenter"],
                    payload["classifier"],
                    payload["input_blob_path"],
                    payload.get("input_local_path"),
                    payload["status"],
                    payload["stage"],
                    payload["progress"],
                    payload.get("error_message"),
                    payload["created_at"],
                    payload["updated_at"],
                    payload.get("started_at"),
                    payload.get("completed_at"),
                    _json_dump(payload.get("bounds")),
                    _json_dump(payload.get("raster_meta", {})),
                ),
            )
        return self.get_job(payload["id"])

    def update_job(self, job_id: str, **fields: Any) -> Dict[str, Any]:
        if not fields:
            job = self.get_job(job_id)
            if job is None:
                raise KeyError(job_id)
            return job

        assignments = []
        values: List[Any] = []
        fields["updated_at"] = _utcnow()
        for key, value in fields.items():
            column = key
            if key == "bounds":
                column = "bounds_json"
                value = _json_dump(value)
            elif key == "raster_meta":
                column = "raster_meta_json"
                value = _json_dump(value)
            assignments.append(f"{column} = ?")
            values.append(value)
        values.append(job_id)

        with self._lock, self.connect() as connection:
            cursor = connection.execute(
                f"UPDATE jobs SET {', '.join(assignments)} WHERE id = ?",
                values,
            )
            if cursor.rowcount == 0:
                raise KeyError(job_id)
        job = self.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        return job

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return self._row_to_job(row)

    def list_jobs(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            rows = connection.execute(
                """
                SELECT jobs.*, COUNT(artifacts.id) AS artifact_count
                FROM jobs
                LEFT JOIN artifacts ON artifacts.job_id = jobs.id
                GROUP BY jobs.id
                ORDER BY jobs.created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        jobs = []
        for row in rows:
            data = self._row_to_job(row)
            if data is None:
                continue
            data["artifact_count"] = row["artifact_count"]
            jobs.append(data)
        return jobs

    def job_counts(self) -> Dict[str, int]:
        with self._lock, self.connect() as connection:
            rows = connection.execute(
                "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status"
            ).fetchall()
        counts = {"total": 0, "queued": 0, "running": 0, "completed": 0, "failed": 0}
        for row in rows:
            counts[row["status"]] = row["count"]
            counts["total"] += row["count"]
        return counts

    def add_event(self, job_id: str, stage: str, message: str) -> None:
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO job_events (job_id, stage, message, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (job_id, stage, message, _utcnow()),
            )

    def list_events(self, job_id: str) -> List[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            rows = connection.execute(
                """
                SELECT stage, message, created_at
                FROM job_events
                WHERE job_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def clear_artifacts(self, job_id: str) -> None:
        with self._lock, self.connect() as connection:
            connection.execute("DELETE FROM artifacts WHERE job_id = ?", (job_id,))

    def add_artifact(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO artifacts (
                    id, job_id, artifact_type, label, layer_name, blob_path, local_path,
                    content_type, size_bytes, bounds_json, metadata_json, is_download,
                    display_order, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["job_id"],
                    payload["artifact_type"],
                    payload["label"],
                    payload.get("layer_name"),
                    payload["blob_path"],
                    payload.get("local_path"),
                    payload["content_type"],
                    payload.get("size_bytes"),
                    _json_dump(payload.get("bounds")),
                    _json_dump(payload.get("metadata", {})),
                    int(payload.get("is_download", True)),
                    payload.get("display_order", 0),
                    payload["created_at"],
                ),
            )
        artifact = self.get_artifact(payload["id"])
        if artifact is None:
            raise KeyError(payload["id"])
        return artifact

    def get_artifact(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM artifacts WHERE id = ?",
                (artifact_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def list_artifacts(self, job_id: str) -> List[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM artifacts
                WHERE job_id = ?
                ORDER BY display_order ASC, created_at ASC
                """,
                (job_id,),
            ).fetchall()
        return [self._row_to_artifact(row) for row in rows]

    def get_layer_artifact(self, job_id: str, layer_name: str) -> Optional[Dict[str, Any]]:
        with self._lock, self.connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM artifacts
                WHERE job_id = ? AND layer_name = ?
                ORDER BY display_order ASC
                LIMIT 1
                """,
                (job_id, layer_name),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def upsert_analytics(self, job_id: str, summary: Dict[str, Any]) -> None:
        now = _utcnow()
        with self._lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO analytics_snapshots (job_id, summary_json, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    summary_json = excluded.summary_json,
                    updated_at = excluded.updated_at
                """,
                (job_id, json.dumps(summary), now, now),
            )

    def get_analytics(self, job_id: str) -> Dict[str, Any]:
        with self._lock, self.connect() as connection:
            row = connection.execute(
                "SELECT summary_json FROM analytics_snapshots WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        if row is None:
            return {}
        return json.loads(row["summary_json"])

