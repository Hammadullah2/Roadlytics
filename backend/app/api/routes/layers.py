"""TileJSON and raster tile routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

router = APIRouter()


@router.get("/{job_id}/layers/{layer}/tilejson.json")
async def layer_tilejson(request: Request, job_id: str, layer: str) -> JSONResponse:
    service = request.app.state.job_service
    try:
        payload = service.tile_service.tilejson(job_id, layer, str(request.base_url).rstrip("/"))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Layer not found.") from exc
    return JSONResponse(payload)


@router.get("/{job_id}/layers/{layer}/{z}/{x}/{y}.png")
async def layer_tile(
    request: Request,
    job_id: str,
    layer: str,
    z: int,
    x: int,
    y: int,
) -> Response:
    service = request.app.state.job_service
    try:
        data = service.tile_service.render_tile(job_id, layer, z, x, y)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Layer not found.") from exc
    return Response(content=data, media_type="image/png")

