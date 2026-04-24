"""Upload initialization and local upload proxy routes."""

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from ...schemas import UploadInitRequest, UploadInitResponse

router = APIRouter()


@router.post("/init", response_model=UploadInitResponse)
async def initialize_upload(request: Request, payload: UploadInitRequest) -> dict:
    service = request.app.state.job_service
    base_url = str(request.base_url)
    return service.initialize_upload(payload, base_url)


@router.post("/{upload_id}/file")
async def upload_file_proxy(
    request: Request,
    upload_id: str,
    file: UploadFile = File(...),
) -> dict:
    service = request.app.state.job_service
    try:
        return service.accept_local_upload(upload_id, file.file, file.content_type or "image/tiff")
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
