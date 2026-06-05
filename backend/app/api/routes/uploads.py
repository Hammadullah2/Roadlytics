"""Upload initialization and local upload proxy routes."""

from __future__ import annotations

from pathlib import Path

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


@router.put("/{upload_id}/file")
async def upload_raw_file_proxy(
    request: Request,
    upload_id: str,
) -> dict:
    """Accept a raw TIFF body so large browser uploads can stream into the app."""
    service = request.app.state.job_service
    content_type = request.headers.get("content-type") or "image/tiff"
    tmp_dir = service.settings.work_root / "_uploads"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{upload_id}.upload"
    bytes_written = 0

    try:
        with tmp_path.open("wb") as handle:
            async for chunk in request.stream():
                if not chunk:
                    continue
                bytes_written += len(chunk)
                handle.write(chunk)
        if bytes_written == 0:
            raise HTTPException(status_code=400, detail="Uploaded file was empty.")
        return service.accept_local_upload_file(upload_id, tmp_path, content_type)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    finally:
        Path(tmp_path).unlink(missing_ok=True)
