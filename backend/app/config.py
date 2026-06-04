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
    processor: str
    modal_app_name: str
    modal_function_name: str
    modal_environment_name: str
    modal_progress_poll_seconds: int
    gemini_api_key: str
    assistant_model: str
    assistant_embedding_model: str
    assistant_chroma_path: Path
    assistant_max_context_chars: int

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
            self.assistant_chroma_path,
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
        processor=os.environ.get("ROADLYTICS_PROCESSOR", "local").strip().lower(),
        modal_app_name=os.environ.get("ROADLYTICS_MODAL_APP", "roadlytics-inference").strip(),
        modal_function_name=os.environ.get("ROADLYTICS_MODAL_FUNCTION", "run_pipeline").strip(),
        modal_environment_name=os.environ.get("ROADLYTICS_MODAL_ENVIRONMENT", "main").strip(),
        modal_progress_poll_seconds=max(
            1,
            int(os.environ.get("ROADLYTICS_MODAL_PROGRESS_POLL_SECONDS", "10")),
        ),
        gemini_api_key=os.environ.get("GEMINI_API_KEY", "").strip(),
        assistant_model=os.environ.get("ROADLYTICS_ASSISTANT_MODEL", "gemini-2.5-flash"),
        assistant_embedding_model=os.environ.get(
            "ROADLYTICS_ASSISTANT_EMBEDDING_MODEL",
            "gemini-embedding-001",
        ),
        assistant_chroma_path=Path(
            os.environ.get("ROADLYTICS_ASSISTANT_CHROMA_PATH", data_root / "chroma")
        ),
        assistant_max_context_chars=int(
            os.environ.get("ROADLYTICS_ASSISTANT_MAX_CONTEXT_CHARS", "18000")
        ),
    )
    settings.ensure_directories()
    return settings
