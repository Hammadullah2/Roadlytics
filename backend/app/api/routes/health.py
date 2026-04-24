"""Health endpoints."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
async def healthcheck(request: Request) -> dict:
    settings = request.app.state.settings
    return {
        "status": "ok",
        "storage_mode": settings.storage_mode,
        "worker_concurrency": settings.worker_concurrency,
    }

