"""Job, artifact, analytics, and report routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from ...schemas import (
    AnalyticsResponse,
    ArtifactsResponse,
    JobCreateRequest,
    JobDetailModel,
    JobsListResponse,
)

router = APIRouter()


@router.get("", response_model=JobsListResponse)
async def list_jobs(request: Request, limit: int = 50) -> dict:
    service = request.app.state.job_service
    return service.list_jobs(str(request.base_url), limit=limit)


@router.post("", response_model=JobDetailModel)
async def create_job(request: Request, payload: JobCreateRequest) -> dict:
    service = request.app.state.job_service
    worker = request.app.state.worker
    try:
        job = service.create_job(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await worker.submit(job["id"])
    return service.get_job_detail(job["id"], str(request.base_url))


@router.get("/{job_id}", response_model=JobDetailModel)
async def get_job(request: Request, job_id: str) -> dict:
    service = request.app.state.job_service
    try:
        return service.get_job_detail(job_id, str(request.base_url))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc


@router.get("/{job_id}/artifacts", response_model=ArtifactsResponse)
async def get_artifacts(request: Request, job_id: str) -> dict:
    service = request.app.state.job_service
    try:
        return service.get_artifacts_payload(job_id, str(request.base_url))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc


@router.get("/{job_id}/analytics", response_model=AnalyticsResponse)
async def get_analytics(request: Request, job_id: str) -> dict:
    service = request.app.state.job_service
    try:
        return service.get_analytics_payload(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc


@router.get("/{job_id}/report", response_class=HTMLResponse)
async def get_report(request: Request, job_id: str) -> HTMLResponse:
    service = request.app.state.job_service
    try:
        html = service.get_report_html(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return HTMLResponse(content=html)

