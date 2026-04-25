"""FastAPI entry point for Roadlytics."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.router import api_router
from .config import get_settings
from .database import Repository
from .services.jobs import JobProcessor, JobService
from .services.worker import WorkerService
from .storage import build_storage_backend


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    repository = Repository(settings.database_path)
    repository.initialize()
    storage = build_storage_backend(settings)
    job_service = JobService(settings, repository, storage)
    processor = JobProcessor(settings, repository, storage)
    worker = WorkerService(settings.worker_concurrency, processor)
    await worker.start()
    for job in repository.list_recoverable_jobs():
        await worker.submit(job["id"])
        repository.add_event(
            job["id"],
            job["stage"],
            "Job re-queued after backend startup.",
        )

    app.state.settings = settings
    app.state.repository = repository
    app.state.storage = storage
    app.state.job_service = job_service
    app.state.worker = worker

    try:
        yield
    finally:
        await worker.stop()


app = FastAPI(title="Roadlytics API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=get_settings().api_prefix)
