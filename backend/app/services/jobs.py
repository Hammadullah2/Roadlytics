"""Job orchestration, serialization, and pipeline execution."""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, BinaryIO, Dict, List, Optional
from urllib.parse import quote, urljoin

from ..config import Settings
from ..database import Repository
from ..enums import (
    ArtifactType,
    JobStage,
    JobStatus,
    display_classifier,
    display_segmenter,
    normalize_classifier,
    normalize_segmenter,
)
from ..schemas import JobCreateRequest, UploadInitRequest
from ..services.reports import render_report_html
from ..services.tiling import TileService
from ..services.validation import (
    build_sentinel_rgb,
    extract_raster_metadata,
    load_json_file,
    package_shapefiles,
    validate_sentinel_l2,
    write_cog_or_copy,
)
from ..services.modal_runner import ModalPipelineRunner
from ..storage.backends import LocalStorageBackend, StorageBackend

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _utcnow() -> str:
    return datetime.now(UTC).isoformat()


def _absolute_url(base_url: str, value: str) -> str:
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return urljoin(base_url, value.lstrip("/"))


@lru_cache(maxsize=1)
def _load_local_pipeline() -> Dict[str, Any]:
    """Load heavy geospatial/ML modules only when local processing is enabled."""
    from road_pipeline.analytics.connectivity import run as connectivity_run
    from road_pipeline.classification.efficientnet import run as efficientnet_run
    from road_pipeline.classification.kmeans import run as kmeans_run
    from road_pipeline.config import (
        CLASS_NAMES,
        CLS_WEIGHTS,
        DEVICE,
        MIN_POLYGON_AREA_M2,
        OSM_BUFFER_M,
        SEG_THRESHOLD,
        SEG_WEIGHTS,
        SIMPLIFY_TOLERANCE_M,
    )
    from road_pipeline.postprocess.raster_to_vector import run as vectorize_run
    from road_pipeline.segmentation.deeplabv3 import run as deeplab_run
    from road_pipeline.segmentation.osm_to_mask import run as osm_run

    return {
        "CLASS_NAMES": CLASS_NAMES,
        "CLS_WEIGHTS": CLS_WEIGHTS,
        "DEVICE": DEVICE,
        "MIN_POLYGON_AREA_M2": MIN_POLYGON_AREA_M2,
        "OSM_BUFFER_M": OSM_BUFFER_M,
        "SEG_THRESHOLD": SEG_THRESHOLD,
        "SEG_WEIGHTS": SEG_WEIGHTS,
        "SIMPLIFY_TOLERANCE_M": SIMPLIFY_TOLERANCE_M,
        "connectivity_run": connectivity_run,
        "efficientnet_run": efficientnet_run,
        "kmeans_run": kmeans_run,
        "vectorize_run": vectorize_run,
        "deeplab_run": deeplab_run,
        "osm_run": osm_run,
    }


@dataclass(frozen=True)
class ArtifactDescriptor:
    artifact_type: str
    label: str
    local_path: Path
    blob_path: str
    content_type: str
    layer_name: str | None = None
    is_download: bool = True
    display_order: int = 0
    metadata: Dict[str, Any] | None = None


LAYER_CONFIG: Dict[str, Dict[str, Any]] = {
    "sentinel": {
        "label": "Sentinel RGB",
        "kind": "raster",
        "default_visible": True,
        "opacity": 0.9,
        "legend_color": None,
    },
    "segmentation": {
        "label": "Road Segmentation",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.75,
        "legend_color": "#4c6d80",
    },
    "combined": {
        "label": "Combined Condition Mask",
        "kind": "raster",
        "default_visible": True,
        "opacity": 0.95,
        "legend_color": None,
    },
    "good": {
        "label": "Good Roads",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.92,
        "legend_color": "#228b22",
    },
    "unpaved": {
        "label": "Unpaved Roads",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.92,
        "legend_color": "#d6392a",
    },
    "damaged": {
        "label": "Damaged Roads",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.92,
        "legend_color": "#f0c419",
    },
    "components": {
        "label": "Connected Components",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.8,
        "legend_color": None,
    },
    "betweenness": {
        "label": "Betweenness Criticality",
        "kind": "raster",
        "default_visible": False,
        "opacity": 0.85,
        "legend_color": None,
    },
    "critical_junctions": {
        "label": "Critical Junctions",
        "kind": "vector",
        "default_visible": False,
        "opacity": 1.0,
        "legend_color": "#c95a27",
    },
}

STAGE_PROGRESS = {
    JobStage.uploaded.value: 5,
    JobStage.validating.value: 15,
    JobStage.segmenting.value: 35,
    JobStage.classifying.value: 60,
    JobStage.connectivity.value: 78,
    JobStage.packaging.value: 92,
    JobStage.completed.value: 100,
    JobStage.failed.value: 100,
}


class JobService:
    def __init__(self, settings: Settings, repository: Repository, storage: StorageBackend) -> None:
        self.settings = settings
        self.repository = repository
        self.storage = storage
        self.tile_service = TileService(repository, storage)

    @staticmethod
    def upload_blob_path(upload_id: str) -> str:
        return f"uploads/{upload_id}/input.tif"

    def initialize_upload(self, request: UploadInitRequest, base_url: str) -> Dict[str, Any]:
        upload_id = str(uuid.uuid4())
        blob_path = self.upload_blob_path(upload_id)
        prepared = self.storage.create_upload_session(
            upload_id=upload_id,
            blob_path=blob_path,
            filename=request.filename,
            content_type=request.content_type,
        )
        return {
            "upload_id": prepared.upload_id,
            "blob_path": prepared.blob_path,
            "filename": prepared.filename,
            "content_type": prepared.content_type,
            "transport": {
                "kind": prepared.kind,
                "url": _absolute_url(base_url, prepared.url),
                "method": prepared.method,
                "headers": prepared.headers,
            },
        }

    def accept_local_upload(self, upload_id: str, stream: BinaryIO, content_type: str) -> Dict[str, str]:
        if not isinstance(self.storage, LocalStorageBackend):
            raise RuntimeError("Local upload endpoint is unavailable in Azure storage mode.")
        blob_path = self.upload_blob_path(upload_id)
        self.storage.upload_stream(blob_path, stream, content_type)
        return {"upload_id": upload_id, "blob_path": blob_path}

    def create_job(self, payload: JobCreateRequest) -> Dict[str, Any]:
        segmenter = normalize_segmenter(payload.segmenter)
        classifier = normalize_classifier(payload.classifier)
        blob_path = self.upload_blob_path(payload.upload_id)
        if not self.storage.exists(blob_path):
            raise FileNotFoundError("Uploaded GeoTIFF was not found. Upload the file before creating a job.")

        now = _utcnow()
        job = self.repository.create_job(
            {
                "id": str(uuid.uuid4()),
                "upload_id": payload.upload_id,
                "project_name": payload.project_name.strip(),
                "description": payload.description.strip(),
                "segmenter": segmenter,
                "classifier": classifier,
                "input_blob_path": blob_path,
                "status": JobStatus.queued.value,
                "stage": JobStage.uploaded.value,
                "progress": STAGE_PROGRESS[JobStage.uploaded.value],
                "created_at": now,
                "updated_at": now,
                "raster_meta": {},
            }
        )
        self.repository.add_event(
            job["id"],
            JobStage.uploaded.value,
            "Upload registered. Waiting for validation and processing.",
        )
        return job

    def list_jobs(self, base_url: str, limit: int = 50) -> Dict[str, Any]:
        jobs = [self.serialize_job(job, base_url) for job in self.repository.list_jobs(limit=limit)]
        return {"jobs": jobs, "counts": self.repository.job_counts()}

    def get_job_detail(self, job_id: str, base_url: str) -> Dict[str, Any]:
        job = self.repository.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        detail = self.serialize_job(job, base_url)
        artifacts_payload = self.get_artifacts_payload(job_id, base_url)
        detail["events"] = self.repository.list_events(job_id)
        detail["artifacts"] = artifacts_payload["artifacts"]
        detail["layers"] = artifacts_payload["layers"]
        return detail

    def serialize_job(self, job: Dict[str, Any], base_url: str) -> Dict[str, Any]:
        artifact_count = job.get("artifact_count")
        if artifact_count is None:
            artifact_count = len(self.repository.list_artifacts(job["id"]))
        return {
            "id": job["id"],
            "upload_id": job["upload_id"],
            "project_name": job["project_name"],
            "description": job.get("description", ""),
            "segmenter": display_segmenter(job["segmenter"]),
            "classifier": display_classifier(job["classifier"]),
            "status": job["status"],
            "stage": job["stage"],
            "progress": int(job.get("progress", 0)),
            "error_message": job.get("error_message"),
            "created_at": job["created_at"],
            "updated_at": job["updated_at"],
            "started_at": job.get("started_at"),
            "completed_at": job.get("completed_at"),
            "bounds": job.get("bounds"),
            "raster_meta": job.get("raster_meta", {}),
            "artifact_count": int(artifact_count),
        }

    def serialize_artifact(self, artifact: Dict[str, Any], base_url: str) -> Dict[str, Any]:
        download_url = _absolute_url(
            base_url,
            self.storage.generate_download_url(
                str(artifact["blob_path"]),
                expires_minutes=self.settings.download_expiry_minutes,
            ),
        )
        return {
            "id": artifact["id"],
            "type": artifact["artifact_type"],
            "label": artifact["label"],
            "layer_name": artifact.get("layer_name"),
            "filename": Path(str(artifact["blob_path"])).name,
            "content_type": artifact["content_type"],
            "download_url": download_url,
            "size_bytes": artifact.get("size_bytes"),
            "bounds": artifact.get("bounds"),
            "metadata": artifact.get("metadata", {}),
            "is_download": bool(artifact.get("is_download", True)),
            "display_order": int(artifact.get("display_order", 0)),
        }

    def get_artifacts_payload(self, job_id: str, base_url: str) -> Dict[str, Any]:
        artifacts = [
            self.serialize_artifact(artifact, base_url)
            for artifact in self.repository.list_artifacts(job_id)
        ]
        layers = self._build_layers(job_id, artifacts, base_url)
        return {"artifacts": artifacts, "layers": layers}

    def _build_layers(
        self,
        job_id: str,
        artifacts: List[Dict[str, Any]],
        base_url: str,
    ) -> List[Dict[str, Any]]:
        layers: List[Dict[str, Any]] = []
        for artifact in artifacts:
            layer_name = artifact.get("layer_name")
            if not layer_name:
                continue
            config = LAYER_CONFIG[layer_name]
            layer = {
                "name": layer_name,
                "label": config["label"],
                "kind": config["kind"],
                "download_url": artifact["download_url"],
                "tilejson_url": None,
                "tiles_url": None,
                "data_url": None,
                "bounds": artifact.get("bounds"),
                "default_visible": config["default_visible"],
                "opacity": config["opacity"],
                "legend_color": config["legend_color"],
            }
            if config["kind"] == "raster":
                layer["tilejson_url"] = (
                    f"{base_url.rstrip('/')}/api/jobs/{job_id}/layers/{layer_name}/tilejson.json"
                )
                layer["tiles_url"] = (
                    f"{base_url.rstrip('/')}/api/jobs/{job_id}/layers/{layer_name}"
                    "/{z}/{x}/{y}.png"
                )
            else:
                layer["data_url"] = artifact["download_url"]
            layers.append(layer)
        return layers

    def get_analytics_payload(self, job_id: str) -> Dict[str, Any]:
        job = self.repository.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        return {"job_id": job_id, "summary": self.repository.get_analytics(job_id)}

    def get_report_html(self, job_id: str) -> str:
        artifacts = self.repository.list_artifacts(job_id)
        report = next((item for item in artifacts if item["artifact_type"] == ArtifactType.report.value), None)
        if report is None:
            raise FileNotFoundError("Report has not been generated for this job yet.")

        local_path = report.get("local_path")
        if local_path and Path(local_path).exists():
            return Path(local_path).read_text(encoding="utf-8")

        cache_path = self.settings.work_root / job_id / "reports" / "report.html"
        self.storage.download_file(str(report["blob_path"]), cache_path)
        return cache_path.read_text(encoding="utf-8")

    def get_local_file_path(self, storage_path: str) -> Path:
        if not isinstance(self.storage, LocalStorageBackend):
            raise FileNotFoundError(storage_path)
        return self.storage.resolve_local_path(storage_path)


class JobProcessor:
    def __init__(self, settings: Settings, repository: Repository, storage: StorageBackend) -> None:
        self.settings = settings
        self.repository = repository
        self.storage = storage

    def _set_stage(
        self,
        job_id: str,
        stage: str,
        message: str,
        *,
        status: str | None = None,
        extra_updates: Dict[str, Any] | None = None,
    ) -> None:
        updates: Dict[str, Any] = {
            "stage": stage,
            "progress": STAGE_PROGRESS[stage],
        }
        if status is not None:
            updates["status"] = status
        if extra_updates:
            updates.update(extra_updates)
        self.repository.update_job(job_id, **updates)
        self.repository.add_event(job_id, stage, message)

    @staticmethod
    def _artifact_blob_path(job_id: str, folder: str, filename: str) -> str:
        return f"jobs/{job_id}/{folder}/{filename}"

    def _register_artifact(self, job_id: str, descriptor: ArtifactDescriptor) -> None:
        self.storage.upload_file(descriptor.local_path, descriptor.blob_path, descriptor.content_type)
        bounds = None
        if descriptor.content_type == "image/tiff":
            bounds = extract_raster_metadata(descriptor.local_path)["bounds"]
        self.repository.add_artifact(
            {
                "id": str(uuid.uuid4()),
                "job_id": job_id,
                "artifact_type": descriptor.artifact_type,
                "label": descriptor.label,
                "layer_name": descriptor.layer_name,
                "blob_path": descriptor.blob_path,
                "local_path": str(descriptor.local_path),
                "content_type": descriptor.content_type,
                "size_bytes": descriptor.local_path.stat().st_size if descriptor.local_path.exists() else None,
                "bounds": bounds,
                "metadata": descriptor.metadata or {},
                "is_download": descriptor.is_download,
                "display_order": descriptor.display_order,
                "created_at": _utcnow(),
            }
        )

    def _register_remote_artifact(self, job_id: str, artifact: Dict[str, Any]) -> None:
        self.repository.add_artifact(
            {
                "id": str(uuid.uuid4()),
                "job_id": job_id,
                "artifact_type": artifact["artifact_type"],
                "label": artifact["label"],
                "layer_name": artifact.get("layer_name"),
                "blob_path": artifact["blob_path"],
                "local_path": artifact.get("local_path"),
                "content_type": artifact["content_type"],
                "size_bytes": artifact.get("size_bytes"),
                "bounds": artifact.get("bounds"),
                "metadata": artifact.get("metadata", {}),
                "is_download": artifact.get("is_download", True),
                "display_order": artifact.get("display_order", 0),
                "created_at": _utcnow(),
            }
        )

    def _add_modal_events(self, job_id: str, events: List[Dict[str, Any]]) -> None:
        existing = {
            (event["stage"], event["message"])
            for event in self.repository.list_events(job_id)
        }
        for event in events:
            stage = str(event.get("stage", "modal"))
            message = str(event.get("message", "")).strip()
            if not message or (stage, message) in existing:
                continue
            self.repository.add_event(job_id, stage, message)
            existing.add((stage, message))

    def _sync_modal_progress(
        self,
        job_id: str,
        *,
        last_signature: tuple[str, str] | None,
    ) -> tuple[str, str] | None:
        progress_blob = self._artifact_blob_path(job_id, "modal", "progress.json")
        if not self.storage.exists(progress_blob):
            return last_signature

        progress_path = self.settings.work_root / job_id / "modal" / "progress.json"
        self.storage.download_file(progress_blob, progress_path)
        progress = load_json_file(progress_path)
        stage = str(progress.get("stage") or "")
        message = str(progress.get("message") or "").strip()
        if stage in STAGE_PROGRESS:
            self.repository.update_job(
                job_id,
                status=JobStatus.running.value,
                stage=stage,
                progress=int(progress.get("progress") or STAGE_PROGRESS[stage]),
            )
        signature = (stage, message)
        if message and signature != last_signature:
            self.repository.add_event(job_id, stage or "modal", message)
            return signature
        return last_signature

    def _process_job_modal(self, job_id: str) -> None:
        job = self.repository.get_job(job_id)
        if job is None:
            raise KeyError(job_id)
        if self.settings.storage_mode != "azure":
            raise RuntimeError("Modal processing requires Azure Blob storage mode.")

        self._set_stage(
            job_id,
            JobStage.validating.value,
            "Submitting the Roadlytics job to Modal GPU inference.",
            status=JobStatus.running.value,
            extra_updates={"started_at": _utcnow()},
        )
        payload = {
            "job_id": job_id,
            "input_blob_path": job["input_blob_path"],
            "output_prefix": f"jobs/{job_id}",
            "project_name": job["project_name"],
            "description": job.get("description", ""),
            "segmenter": job["segmenter"],
            "classifier": job["classifier"],
        }

        runner = ModalPipelineRunner(self.settings)
        function_call = runner.spawn(payload)
        call_id = function_call.object_id
        if call_id:
            self.repository.add_event(
                job_id,
                JobStage.validating.value,
                f"Modal function call started: {call_id}",
            )

        last_signature: tuple[str, str] | None = None
        while True:
            try:
                result = function_call.get(timeout=self.settings.modal_progress_poll_seconds)
                break
            except TimeoutError:
                last_signature = self._sync_modal_progress(
                    job_id,
                    last_signature=last_signature,
                )

        if result.get("status") != "completed":
            raise RuntimeError(result.get("error_message") or "Modal processing did not complete.")

        self._add_modal_events(job_id, result.get("events", []))
        self.repository.update_job(
            job_id,
            input_local_path=None,
            bounds=result.get("bounds"),
            raster_meta=result.get("raster_meta", {}),
        )
        self.repository.upsert_analytics(job_id, result.get("analytics_summary", {}))
        self.repository.clear_artifacts(job_id)
        for artifact in result.get("artifacts", []):
            self._register_remote_artifact(job_id, artifact)

        self._set_stage(
            job_id,
            JobStage.completed.value,
            "Modal processing complete. Artifacts and map layers are ready.",
            status=JobStatus.completed.value,
            extra_updates={"completed_at": _utcnow(), "error_message": None},
        )

    def process_job(self, job_id: str) -> None:
        if self.settings.processor == "modal":
            try:
                self._process_job_modal(job_id)
            except Exception as exc:
                self.repository.update_job(
                    job_id,
                    status=JobStatus.failed.value,
                    stage=JobStage.failed.value,
                    progress=STAGE_PROGRESS[JobStage.failed.value],
                    error_message=str(exc),
                    completed_at=_utcnow(),
                )
                self.repository.add_event(
                    job_id,
                    JobStage.failed.value,
                    f"Modal job failed: {exc}",
                )
                raise
            return
        if self.settings.processor != "local":
            raise RuntimeError(
                "ROADLYTICS_PROCESSOR must be either 'local' or 'modal'."
            )
        pipeline = _load_local_pipeline()

        job = self.repository.get_job(job_id)
        if job is None:
            raise KeyError(job_id)

        work_root = self.settings.work_root / job_id
        input_dir = work_root / "input"
        pipeline_dir = work_root / "pipeline"
        segmentation_dir = pipeline_dir / "segmentation"
        classification_dir = pipeline_dir / "classification"
        shapefile_dir = pipeline_dir / "shapefiles"
        connectivity_dir = pipeline_dir / "connectivity"
        display_dir = work_root / "display"
        report_dir = work_root / "reports"
        for path in (
            input_dir,
            segmentation_dir,
            classification_dir,
            shapefile_dir,
            connectivity_dir,
            display_dir,
            report_dir,
        ):
            path.mkdir(parents=True, exist_ok=True)

        try:
            self._set_stage(
                job_id,
                JobStage.validating.value,
                "Downloading and validating the uploaded Sentinel-2 GeoTIFF.",
                status=JobStatus.running.value,
                extra_updates={"started_at": _utcnow()},
            )
            input_path = input_dir / "sentinel_l2.tif"
            self.storage.download_file(job["input_blob_path"], input_path)
            raster_meta = validate_sentinel_l2(input_path)
            sentinel_rgb_path = build_sentinel_rgb(input_path, display_dir / "sentinel_rgb.tif")
            sentinel_rgb_display = write_cog_or_copy(
                sentinel_rgb_path,
                display_dir / "sentinel_rgb_display.tif",
            )
            self.repository.update_job(
                job_id,
                input_local_path=str(input_path),
                bounds=raster_meta["bounds"],
                raster_meta=raster_meta,
            )

            self._set_stage(
                job_id,
                JobStage.segmenting.value,
                "Generating the road segmentation mask.",
            )
            if job["segmenter"] == "deeplab":
                seg_mask_path = pipeline["deeplab_run"](
                    input_tif=input_path,
                    output_dir=segmentation_dir,
                    threshold=pipeline["SEG_THRESHOLD"],
                    weights_path=pipeline["SEG_WEIGHTS"],
                    device=pipeline["DEVICE"],
                )
            else:
                seg_mask_path = pipeline["osm_run"](
                    input_tif=input_path,
                    output_dir=segmentation_dir,
                    buffer_m=pipeline["OSM_BUFFER_M"],
                )

            self._set_stage(
                job_id,
                JobStage.classifying.value,
                "Classifying road condition masks.",
            )
            stem = f"{input_path.stem}_{job['segmenter']}_{job['classifier']}"
            if job["classifier"] == "efficientnet":
                cls_paths = pipeline["efficientnet_run"](
                    stack_path=input_path,
                    mask_path=seg_mask_path,
                    stem=stem,
                    output_dir=classification_dir,
                    weights_path=pipeline["CLS_WEIGHTS"],
                    device=pipeline["DEVICE"],
                )
            else:
                cls_paths = pipeline["kmeans_run"](
                    stack_path=input_path,
                    mask_path=seg_mask_path,
                    stem=stem,
                    output_dir=classification_dir,
                )

            class_tifs = {
                name: Path(cls_paths[index])
                for index, name in enumerate(pipeline["CLASS_NAMES"])
            }
            combined_tif = Path(cls_paths[3])

            self._set_stage(
                job_id,
                JobStage.connectivity.value,
                "Running raster-first connectivity analytics.",
            )
            connectivity = pipeline["connectivity_run"](
                seg_mask_path=seg_mask_path,
                classified_tif_path=combined_tif,
                output_dir=connectivity_dir,
            )

            self._set_stage(
                job_id,
                JobStage.packaging.value,
                "Packaging artifacts, reports, and map-ready layers.",
            )
            shapefiles = pipeline["vectorize_run"](
                class_tifs=class_tifs,
                output_dir=shapefile_dir,
                min_area_m2=pipeline["MIN_POLYGON_AREA_M2"],
                simplify_tolerance_m=pipeline["SIMPLIFY_TOLERANCE_M"],
            )
            shapefile_zip = package_shapefiles(
                shapefiles,
                report_dir / "road_condition_shapefiles.zip",
            )

            segmentation_display = write_cog_or_copy(
                seg_mask_path,
                display_dir / "segmentation_mask.tif",
            )
            class_displays = {
                name: write_cog_or_copy(path, display_dir / f"{name}.tif")
                for name, path in class_tifs.items()
            }
            combined_display = write_cog_or_copy(combined_tif, display_dir / "combined.tif")
            component_display = write_cog_or_copy(
                Path(connectivity.component_map),
                display_dir / "component_map.tif",
            )
            betweenness_display = write_cog_or_copy(
                Path(connectivity.betweenness_map),
                display_dir / "betweenness_centrality.tif",
            )

            analytics_summary = load_json_file(Path(connectivity.summary_json))
            self.repository.upsert_analytics(job_id, analytics_summary)
            self.repository.clear_artifacts(job_id)

            descriptors = [
                ArtifactDescriptor(
                    artifact_type=ArtifactType.sentinel.value,
                    label="Sentinel RGB",
                    local_path=sentinel_rgb_display,
                    blob_path=self._artifact_blob_path(job_id, "rasters", "sentinel_rgb.tif"),
                    content_type="image/tiff",
                    layer_name="sentinel",
                    display_order=10,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.segmentation.value,
                    label="Road Segmentation Mask",
                    local_path=segmentation_display,
                    blob_path=self._artifact_blob_path(job_id, "rasters", "segmentation_mask.tif"),
                    content_type="image/tiff",
                    layer_name="segmentation",
                    display_order=20,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.good.value,
                    label="Good Road Mask",
                    local_path=class_displays["good"],
                    blob_path=self._artifact_blob_path(job_id, "rasters", "good.tif"),
                    content_type="image/tiff",
                    layer_name="good",
                    display_order=30,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.unpaved.value,
                    label="Unpaved Road Mask",
                    local_path=class_displays["unpaved"],
                    blob_path=self._artifact_blob_path(job_id, "rasters", "unpaved.tif"),
                    content_type="image/tiff",
                    layer_name="unpaved",
                    display_order=40,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.damaged.value,
                    label="Damaged Road Mask",
                    local_path=class_displays["damaged"],
                    blob_path=self._artifact_blob_path(job_id, "rasters", "damaged.tif"),
                    content_type="image/tiff",
                    layer_name="damaged",
                    display_order=50,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.combined.value,
                    label="Combined Condition Mask",
                    local_path=combined_display,
                    blob_path=self._artifact_blob_path(job_id, "rasters", "combined.tif"),
                    content_type="image/tiff",
                    layer_name="combined",
                    display_order=60,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.components.value,
                    label="Connected Components Raster",
                    local_path=component_display,
                    blob_path=self._artifact_blob_path(job_id, "analytics", "component_map.tif"),
                    content_type="image/tiff",
                    layer_name="components",
                    display_order=70,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.betweenness.value,
                    label="Betweenness Centrality Raster",
                    local_path=betweenness_display,
                    blob_path=self._artifact_blob_path(
                        job_id,
                        "analytics",
                        "betweenness_centrality.tif",
                    ),
                    content_type="image/tiff",
                    layer_name="betweenness",
                    display_order=80,
                    metadata={"kind": "raster"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.critical_junctions.value,
                    label="Critical Junctions GeoJSON",
                    local_path=Path(connectivity.critical_junctions_geojson),
                    blob_path=self._artifact_blob_path(
                        job_id,
                        "analytics",
                        "critical_junctions.geojson",
                    ),
                    content_type="application/geo+json",
                    layer_name="critical_junctions",
                    display_order=90,
                    metadata={"kind": "vector"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.components_csv.value,
                    label="Connected Components CSV",
                    local_path=Path(connectivity.components_csv),
                    blob_path=self._artifact_blob_path(
                        job_id,
                        "analytics",
                        "connected_components.csv",
                    ),
                    content_type="text/csv",
                    display_order=100,
                    metadata={"kind": "table"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.analytics_summary.value,
                    label="Connectivity Summary JSON",
                    local_path=Path(connectivity.summary_json),
                    blob_path=self._artifact_blob_path(
                        job_id,
                        "analytics",
                        "analytics_summary.json",
                    ),
                    content_type="application/json",
                    display_order=110,
                    metadata={"kind": "document"},
                ),
                ArtifactDescriptor(
                    artifact_type=ArtifactType.shapefile_zip.value,
                    label="Road Condition Shapefiles",
                    local_path=shapefile_zip,
                    blob_path=self._artifact_blob_path(
                        job_id,
                        "downloads",
                        "road_condition_shapefiles.zip",
                    ),
                    content_type="application/zip",
                    display_order=120,
                    metadata={"kind": "archive"},
                ),
            ]

            report_job = dict(self.repository.get_job(job_id) or job)
            report_job["segmenter"] = display_segmenter(job["segmenter"])
            report_job["classifier"] = display_classifier(job["classifier"])
            report_html = render_report_html(
                report_job,
                analytics_summary,
                [
                    {
                        "label": descriptor.label,
                        "filename": descriptor.local_path.name,
                        "is_download": descriptor.is_download,
                    }
                    for descriptor in descriptors
                ],
            )
            report_path = report_dir / "report.html"
            report_path.write_text(report_html, encoding="utf-8")
            descriptors.append(
                ArtifactDescriptor(
                    artifact_type=ArtifactType.report.value,
                    label="Assessment Report",
                    local_path=report_path,
                    blob_path=self._artifact_blob_path(job_id, "reports", "report.html"),
                    content_type="text/html; charset=utf-8",
                    display_order=130,
                    metadata={"kind": "document"},
                )
            )

            for descriptor in descriptors:
                self._register_artifact(job_id, descriptor)

            self._set_stage(
                job_id,
                JobStage.completed.value,
                "Processing complete. Artifacts and map layers are ready.",
                status=JobStatus.completed.value,
                extra_updates={"completed_at": _utcnow(), "error_message": None},
            )
        except Exception as exc:
            self.repository.update_job(
                job_id,
                status=JobStatus.failed.value,
                stage=JobStage.failed.value,
                progress=STAGE_PROGRESS[JobStage.failed.value],
                error_message=str(exc),
                completed_at=_utcnow(),
            )
            self.repository.add_event(
                job_id,
                JobStage.failed.value,
                f"Job failed: {exc}",
            )
            raise
