"""Application settings for the Roadlytics backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str
    api_prefix: str
    debug: bool
    repo_root: Path
    backend_root: Path
    data_root: Path
    database_path: Path
    work_root: Path
    local_storage_root: Path
    upload_expiry_minutes: int
    download_expiry_minutes: int
    worker_concurrency: int
    tile_cache_max_age: int
    blob_connection_string: str
    blob_container: str

    @property
    def storage_mode(self) -> str:
        return "azure" if self.blob_connection_string else "local"

    def ensure_directories(self) -> None:
        for path in (
            self.data_root,
            self.work_root,
            self.local_storage_root,
            self.local_storage_root / "uploads",
            self.local_storage_root / "jobs",
            self.local_storage_root / "reports",
        ):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    repo_root = Path(__file__).resolve().parents[2]
    backend_root = repo_root / "backend"
    data_root = backend_root / "data"
    settings = Settings(
        app_name="Roadlytics API",
        api_prefix="/api",
        debug=_env_bool("ROADLYTICS_DEBUG", False),
        repo_root=repo_root,
        backend_root=backend_root,
        data_root=data_root,
        database_path=Path(os.environ.get("ROADLYTICS_DB_PATH", data_root / "roadlytics.db")),
        work_root=Path(os.environ.get("ROADLYTICS_WORK_ROOT", data_root / "work")),
        local_storage_root=Path(
            os.environ.get("ROADLYTICS_LOCAL_STORAGE_ROOT", data_root / "storage")
        ),
        upload_expiry_minutes=int(os.environ.get("ROADLYTICS_UPLOAD_EXPIRY_MINUTES", "60")),
        download_expiry_minutes=int(
            os.environ.get("ROADLYTICS_DOWNLOAD_EXPIRY_MINUTES", "180")
        ),
        worker_concurrency=max(1, int(os.environ.get("ROADLYTICS_WORKER_CONCURRENCY", "1"))),
        tile_cache_max_age=int(os.environ.get("ROADLYTICS_TILE_CACHE_MAX_AGE", "300")),
        blob_connection_string=os.environ.get("AZURE_STORAGE_CONNECTION_STRING", "").strip(),
        blob_container=os.environ.get("AZURE_STORAGE_CONTAINER", "roadlytics"),
    )
    settings.ensure_directories()
    return settings

