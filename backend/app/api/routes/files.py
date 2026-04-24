"""Local-file download route used by the local storage backend."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter()


@router.get("/files/{storage_path:path}", include_in_schema=False, name="download_local_file")
async def download_local_file(request: Request, storage_path: str) -> FileResponse:
    service = request.app.state.job_service
    try:
        path = service.get_local_file_path(storage_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Artifact not found.") from exc
    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found.")
    return FileResponse(path)
