"""Modal GPU app for Roadlytics pipeline execution.

Deploy from the repository root with:

    modal deploy modal_app/roadlytics_modal.py
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List
import json
import sys

import modal

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = Path("/app")

assets_volume = modal.Volume.from_name("roadlytics-assets")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "build-essential",
        "gdal-bin",
        "libgdal-dev",
        "libproj-dev",
        "proj-bin",
        "proj-data",
        "libgeos-dev",
        "libspatialindex-dev",
        "libgl1",
        "libglib2.0-0",
    )
    .pip_install_from_requirements(str(REPO_ROOT / "road_pipeline" / "requirements.txt"))
    .pip_install_from_requirements(str(REPO_ROOT / "backend" / "requirements.txt"))
    .env(
        {
            "DRIVE_ROOT": "/app",
            "ROADLYTICS_MODEL_WEIGHTS_DIR": "/assets/model_weights",
            "ROADLYTICS_OSM_DIR": "/assets/osm_roads",
            "ROADLYTICS_WORK_ROOT": "/tmp/roadlytics/work",
            "ROADLYTICS_LOCAL_STORAGE_ROOT": "/tmp/roadlytics/storage",
            "ROADLYTICS_DB_PATH": "/tmp/roadlytics/roadlytics.db",
            "ROADLYTICS_ASSISTANT_CHROMA_PATH": "/tmp/roadlytics/chroma",
        }
    )
    .add_local_dir(str(REPO_ROOT / "road_pipeline"), remote_path="/app/road_pipeline")
    .add_local_dir(str(REPO_ROOT / "backend"), remote_path="/app/backend")
)

app = modal.App("roadlytics-inference", image=image)


def _bootstrap_imports() -> None:
    if str(APP_ROOT) not in sys.path:
        sys.path.insert(0, str(APP_ROOT))


def _artifact_blob_path(job_id: str, folder: str, filename: str) -> str:
    return f"jobs/{job_id}/{folder}/{filename}"


def _event(events: List[Dict[str, str]], stage: str, message: str) -> None:
    events.append({"stage": stage, "message": message})


def _publish_progress(storage: Any, job_id: str, stage: str, message: str, progress: int) -> None:
    payload = {
        "job_id": job_id,
        "stage": stage,
        "message": message,
        "progress": progress,
    }
    storage.upload_stream(
        _artifact_blob_path(job_id, "modal", "progress.json"),
        BytesIO(json.dumps(payload).encode("utf-8")),
        "application/json",
    )


@app.function(
    gpu=["A10", "T4"],
    timeout=3 * 60 * 60,
    max_containers=1,
    memory=32768,
    secrets=[modal.Secret.from_name("roadlytics-azure")],
    volumes={"/assets": assets_volume},
)
def run_pipeline(payload: Dict[str, Any]) -> Dict[str, Any]:
    _bootstrap_imports()

    from backend.app.config import get_settings
    from backend.app.enums import ArtifactType, display_classifier, display_segmenter
    from backend.app.services.reports import render_report_html
    from backend.app.services.validation import (
        build_sentinel_rgb,
        extract_raster_metadata,
        load_json_file,
        package_shapefiles,
        validate_sentinel_l2,
        write_cog_or_copy,
    )
    from backend.app.storage import build_storage_backend
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

    settings = get_settings()
    storage = build_storage_backend(settings)
    job_id = str(payload["job_id"])
    input_blob_path = str(payload["input_blob_path"])
    segmenter = str(payload["segmenter"])
    classifier = str(payload["classifier"])
    events: List[Dict[str, str]] = []
    artifacts: List[Dict[str, Any]] = []

    work_root = Path("/tmp/roadlytics/jobs") / job_id
    input_dir = work_root / "input"
    pipeline_dir = work_root / "pipeline"
    segmentation_dir = pipeline_dir / "segmentation"
    classification_dir = pipeline_dir / "classification"
    shapefile_dir = pipeline_dir / "shapefiles"
    connectivity_dir = pipeline_dir / "connectivity"
    display_dir = work_root / "display"
    report_dir = work_root / "reports"
    for directory in (
        input_dir,
        segmentation_dir,
        classification_dir,
        shapefile_dir,
        connectivity_dir,
        display_dir,
        report_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    def stage(stage_name: str, message: str, progress: int) -> None:
        _event(events, stage_name, message)
        _publish_progress(storage, job_id, stage_name, message, progress)

    def upload_artifact(
        *,
        artifact_type: str,
        label: str,
        local_path: Path,
        folder: str,
        filename: str,
        content_type: str,
        layer_name: str | None = None,
        is_download: bool = True,
        display_order: int = 0,
        metadata: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        blob_path = _artifact_blob_path(job_id, folder, filename)
        storage.upload_file(local_path, blob_path, content_type)
        bounds = None
        if content_type == "image/tiff":
            bounds = extract_raster_metadata(local_path)["bounds"]
        artifact = {
            "artifact_type": artifact_type,
            "label": label,
            "layer_name": layer_name,
            "blob_path": blob_path,
            "local_path": None,
            "content_type": content_type,
            "size_bytes": local_path.stat().st_size if local_path.exists() else None,
            "bounds": bounds,
            "metadata": metadata or {},
            "is_download": is_download,
            "display_order": display_order,
        }
        artifacts.append(artifact)
        return artifact

    stage("validating", "Modal worker downloading and validating Sentinel-2 GeoTIFF.", 15)
    input_path = input_dir / "sentinel_l2.tif"
    storage.download_file(input_blob_path, input_path)
    raster_meta = validate_sentinel_l2(input_path)
    sentinel_rgb_path = build_sentinel_rgb(input_path, display_dir / "sentinel_rgb.tif")
    sentinel_rgb_display = write_cog_or_copy(
        sentinel_rgb_path,
        display_dir / "sentinel_rgb_display.tif",
    )

    stage("segmenting", "Modal worker generating road segmentation mask.", 35)
    if segmenter == "deeplab":
        seg_mask_path = deeplab_run(
            input_tif=input_path,
            output_dir=segmentation_dir,
            threshold=SEG_THRESHOLD,
            weights_path=SEG_WEIGHTS,
            device=DEVICE,
        )
    else:
        seg_mask_path = osm_run(
            input_tif=input_path,
            output_dir=segmentation_dir,
            buffer_m=OSM_BUFFER_M,
        )

    stage("classifying", "Modal worker classifying road condition masks.", 60)
    stem = f"{input_path.stem}_{segmenter}_{classifier}"
    if classifier == "efficientnet":
        cls_paths = efficientnet_run(
            stack_path=input_path,
            mask_path=seg_mask_path,
            stem=stem,
            output_dir=classification_dir,
            weights_path=CLS_WEIGHTS,
            device=DEVICE,
        )
    else:
        cls_paths = kmeans_run(
            stack_path=input_path,
            mask_path=seg_mask_path,
            stem=stem,
            output_dir=classification_dir,
        )

    class_tifs = {name: Path(cls_paths[index]) for index, name in enumerate(CLASS_NAMES)}
    combined_tif = Path(cls_paths[3])

    stage("connectivity", "Modal worker running raster-first connectivity analytics.", 78)
    connectivity = connectivity_run(
        seg_mask_path=seg_mask_path,
        classified_tif_path=combined_tif,
        output_dir=connectivity_dir,
    )

    stage("packaging", "Modal worker packaging artifacts and report.", 92)
    shapefiles = vectorize_run(
        class_tifs=class_tifs,
        output_dir=shapefile_dir,
        min_area_m2=MIN_POLYGON_AREA_M2,
        simplify_tolerance_m=SIMPLIFY_TOLERANCE_M,
    )
    shapefile_zip = package_shapefiles(
        shapefiles,
        report_dir / "road_condition_shapefiles.zip",
    )

    segmentation_display = write_cog_or_copy(seg_mask_path, display_dir / "segmentation_mask.tif")
    class_displays = {
        name: write_cog_or_copy(path, display_dir / f"{name}.tif")
        for name, path in class_tifs.items()
    }
    combined_display = write_cog_or_copy(combined_tif, display_dir / "combined.tif")
    component_display = write_cog_or_copy(Path(connectivity.component_map), display_dir / "component_map.tif")
    betweenness_display = write_cog_or_copy(
        Path(connectivity.betweenness_map),
        display_dir / "betweenness_centrality.tif",
    )
    analytics_summary = load_json_file(Path(connectivity.summary_json))

    artifact_specs = [
        (ArtifactType.sentinel.value, "Sentinel RGB", sentinel_rgb_display, "rasters", "sentinel_rgb.tif", "image/tiff", "sentinel", 10, {"kind": "raster"}),
        (ArtifactType.segmentation.value, "Road Segmentation Mask", segmentation_display, "rasters", "segmentation_mask.tif", "image/tiff", "segmentation", 20, {"kind": "raster"}),
        (ArtifactType.good.value, "Good Road Mask", class_displays["good"], "rasters", "good.tif", "image/tiff", "good", 30, {"kind": "raster"}),
        (ArtifactType.unpaved.value, "Unpaved Road Mask", class_displays["unpaved"], "rasters", "unpaved.tif", "image/tiff", "unpaved", 40, {"kind": "raster"}),
        (ArtifactType.damaged.value, "Damaged Road Mask", class_displays["damaged"], "rasters", "damaged.tif", "image/tiff", "damaged", 50, {"kind": "raster"}),
        (ArtifactType.combined.value, "Combined Condition Mask", combined_display, "rasters", "combined.tif", "image/tiff", "combined", 60, {"kind": "raster"}),
        (ArtifactType.components.value, "Connected Components Raster", component_display, "analytics", "component_map.tif", "image/tiff", "components", 70, {"kind": "raster"}),
        (ArtifactType.betweenness.value, "Betweenness Centrality Raster", betweenness_display, "analytics", "betweenness_centrality.tif", "image/tiff", "betweenness", 80, {"kind": "raster"}),
        (ArtifactType.critical_junctions.value, "Critical Junctions GeoJSON", Path(connectivity.critical_junctions_geojson), "analytics", "critical_junctions.geojson", "application/geo+json", "critical_junctions", 90, {"kind": "vector"}),
        (ArtifactType.components_csv.value, "Connected Components CSV", Path(connectivity.components_csv), "analytics", "connected_components.csv", "text/csv", None, 100, {"kind": "table"}),
        (ArtifactType.analytics_summary.value, "Connectivity Summary JSON", Path(connectivity.summary_json), "analytics", "analytics_summary.json", "application/json", None, 110, {"kind": "document"}),
        (ArtifactType.shapefile_zip.value, "Road Condition Shapefiles", shapefile_zip, "downloads", "road_condition_shapefiles.zip", "application/zip", None, 120, {"kind": "archive"}),
    ]
    for artifact_type, label, local_path, folder, filename, content_type, layer_name, order, metadata in artifact_specs:
        upload_artifact(
            artifact_type=artifact_type,
            label=label,
            local_path=Path(local_path),
            folder=folder,
            filename=filename,
            content_type=content_type,
            layer_name=layer_name,
            display_order=order,
            metadata=metadata,
        )

    report_job = {
        "id": job_id,
        "project_name": payload.get("project_name", "Roadlytics Assessment"),
        "description": payload.get("description", ""),
        "segmenter": display_segmenter(segmenter),
        "classifier": display_classifier(classifier),
        "bounds": raster_meta["bounds"],
    }
    report_html = render_report_html(
        report_job,
        analytics_summary,
        [
            {
                "label": artifact["label"],
                "filename": Path(str(artifact["blob_path"])).name,
                "is_download": artifact.get("is_download", True),
            }
            for artifact in artifacts
        ],
    )
    report_path = report_dir / "report.html"
    report_path.write_text(report_html, encoding="utf-8")
    upload_artifact(
        artifact_type=ArtifactType.report.value,
        label="Assessment Report",
        local_path=report_path,
        folder="reports",
        filename="report.html",
        content_type="text/html; charset=utf-8",
        display_order=130,
        metadata={"kind": "document"},
    )

    stage("completed", "Modal worker completed Roadlytics processing.", 100)
    return {
        "status": "completed",
        "job_id": job_id,
        "bounds": raster_meta["bounds"],
        "raster_meta": raster_meta,
        "analytics_summary": analytics_summary,
        "artifacts": artifacts,
        "events": events,
    }
