"""Aggregate API router."""

from fastapi import APIRouter

from .routes import files, health, jobs, layers, uploads

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(files.router, tags=["files"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(layers.router, prefix="/jobs", tags=["layers"])
