"""Pydantic request and response models for the API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class UploadInitRequest(BaseModel):
    filename: str = Field(default="sentinel_l2.tif")
    content_type: str = Field(default="image/tiff")


class UploadTransport(BaseModel):
    kind: Literal["azure_sas", "backend_proxy"]
    url: str
    method: str
    headers: Dict[str, str] = Field(default_factory=dict)


class UploadInitResponse(BaseModel):
    upload_id: str
    blob_path: str
    filename: str
    content_type: str
    transport: UploadTransport


class JobCreateRequest(BaseModel):
    upload_id: str
    project_name: str
    description: str = ""
    segmenter: str
    classifier: str


class JobEventModel(BaseModel):
    stage: str
    message: str
    created_at: str


class ArtifactModel(BaseModel):
    id: str
    type: str
    label: str
    layer_name: Optional[str] = None
    filename: str
    content_type: str
    download_url: Optional[str] = None
    size_bytes: Optional[int] = None
    bounds: Optional[List[float]] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_download: bool = True
    display_order: int = 0


class LayerModel(BaseModel):
    name: str
    label: str
    kind: Literal["raster", "vector"]
    download_url: Optional[str] = None
    tilejson_url: Optional[str] = None
    tiles_url: Optional[str] = None
    data_url: Optional[str] = None
    bounds: Optional[List[float]] = None
    default_visible: bool = False
    opacity: float = 1.0
    legend_color: Optional[str] = None


class JobSummaryModel(BaseModel):
    id: str
    upload_id: str
    project_name: str
    description: str
    segmenter: str
    classifier: str
    status: str
    stage: str
    progress: int
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    bounds: Optional[List[float]] = None
    raster_meta: Dict[str, Any] = Field(default_factory=dict)
    artifact_count: int = 0


class JobDetailModel(JobSummaryModel):
    events: List[JobEventModel] = Field(default_factory=list)
    artifacts: List[ArtifactModel] = Field(default_factory=list)
    layers: List[LayerModel] = Field(default_factory=list)


class JobsListResponse(BaseModel):
    jobs: List[JobSummaryModel]
    counts: Dict[str, int]


class ArtifactsResponse(BaseModel):
    artifacts: List[ArtifactModel]
    layers: List[LayerModel]


class AnalyticsResponse(BaseModel):
    job_id: str
    summary: Dict[str, Any]

