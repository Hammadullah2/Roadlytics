"""End-to-end pipeline orchestrator."""

import logging
import uuid
from pathlib import Path
from typing import Callable, Optional

from .config   import settings, PIPELINE_CONFIG
from .models   import load_segmentation_model, load_classification_model
from .stages.preprocess import preprocess
from .stages.segment    import segment
from .stages.classify   import classify
from .stages.graph      import build_graph
from .stages.report     import generate_report
from .sentinelhub_fetcher import SentinelHubFetcher

log = logging.getLogger(__name__)


class InferencePipeline:
    """
    Loaded once at server startup; reused across all requests.
    Supports two input modes:
      1. fetch_and_run(aoi_bbox, start_date, end_date)  — fetches via SentinelHub
      2. run_on_tif(tif_path)                           — uses pre-downloaded file
    """

    def __init__(self, device: Optional[str] = None):
        self.device  = device or settings.device
        self.config  = PIPELINE_CONFIG
        self.seg_model = load_segmentation_model(self.config, self.device)
        self.clf_model = load_classification_model(self.config, self.device)  # may be None
        self.fetcher = SentinelHubFetcher()

        if self.clf_model is None:
            log.warning(
                "[InferencePipeline] Classifier not loaded — P4 will assign "
                "'Unclassified' to all road segments."
            )
        log.info("[InferencePipeline] ready on %s", self.device)
        print(f"[InferencePipeline] ready on {self.device}")

    def fetch_and_run(
        self,
        aoi_bbox:        tuple,
        start_date:      str,
        end_date:        str,
        region_name:     str,
        max_cloud_cover: float = None,
        resolution_m:    int   = None,
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """Fetch from SentinelHub then run full pipeline."""
        job_id = uuid.uuid4().hex[:8].upper()
        job_dir = settings.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        cb = progress_callback or (lambda s, p, m: None)

        try:
            cb("fetch", 0, "Querying SentinelHub for imagery")
            tif_path = job_dir / "sentinel_raw.tif"
            scene_meta = self.fetcher.fetch_geotiff(
                aoi_bbox        = aoi_bbox,
                start_date      = start_date,
                end_date        = end_date,
                output_path     = tif_path,
                resolution_m    = resolution_m    or settings.default_resolution_m,
                max_cloud_cover = max_cloud_cover or settings.default_max_cloud_cover,
            )
            cb("fetch", 100, f"Downloaded scene {scene_meta['scene_id']}")

            return self._run_pipeline(
                tif_path    = Path(scene_meta["path"]),
                job_id      = job_id,
                job_dir     = job_dir,
                region_name = region_name,
                scene_meta  = scene_meta,
                callback    = cb,
            )
        except Exception as e:
            log.exception("Pipeline failed for job %s", job_id)
            return {
                "status":        "error",
                "job_id":        job_id,
                "error_message": str(e),
            }

    def run_on_tif(
        self,
        tif_path:    Path,
        region_name: str,
        progress_callback: Optional[Callable] = None,
    ) -> dict:
        """Run pipeline on a pre-supplied GeoTIFF (bypasses SentinelHub fetch)."""
        job_id  = uuid.uuid4().hex[:8].upper()
        job_dir = settings.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        cb = progress_callback or (lambda s, p, m: None)

        try:
            return self._run_pipeline(
                tif_path    = tif_path,
                job_id      = job_id,
                job_dir     = job_dir,
                region_name = region_name,
                scene_meta  = {"scene_id": "user_upload",
                                "acquisition_date": "unknown",
                                "cloud_cover": 0.0},
                callback    = cb,
            )
        except Exception as e:
            log.exception("Pipeline failed for job %s", job_id)
            return {
                "status":        "error",
                "job_id":        job_id,
                "error_message": str(e),
            }

    def _run_pipeline(self, tif_path, job_id, job_dir, region_name,
                      scene_meta, callback):
        """Internal method running all 6 pipeline stages."""

        # ── P1+P2: Preprocess ──────────────────────────────────────────────
        callback("preprocess", 0, "Starting preprocessing")
        norm_path = preprocess(
            tif_path, job_dir, self.config,
            progress_callback=lambda p, m: callback("preprocess", p, m),
        )

        # ── P3: Segment ────────────────────────────────────────────────────
        callback("segment", 0, "Starting segmentation")
        seg_path, raw_shp = segment(
            norm_path, job_dir, self.seg_model, self.config, self.device,
            progress_callback=lambda p, m: callback("segment", p, m),
            raw_tif_path=tif_path,
        )

        # ── P4: Classify ───────────────────────────────────────────────────
        callback("classify", 0, "Starting classification")
        clf_shp, clf_csv = classify(
            norm_path, raw_shp, job_dir, self.clf_model, self.config, self.device,
            progress_callback=lambda p, m: callback("classify", p, m),
            seg_path=seg_path,
        )

        # ── P5: Graph ─────────────────────────────────────────────────────
        callback("graph", 0, "Building road graph")
        graphml, graph_gj, comp_csv, graph_stats = build_graph(
            clf_shp, job_dir, self.config,
            progress_callback=lambda p, m: callback("graph", p, m),
        )

        # ── P6: Report ─────────────────────────────────────────────────────
        callback("report", 0, "Generating report")
        pdf_path, zip_path = generate_report(
            roads_shp  = clf_shp,
            seg_tif    = seg_path,
            comp_csv   = comp_csv,
            stats      = graph_stats,
            region     = region_name,
            scene_meta = scene_meta,
            output_dir = job_dir,
            report_id  = job_id,
            progress_callback=lambda p, m: callback("report", p, m),
        )

        callback("complete", 100, "All stages finished")

        return {
            "status":        "success",
            "job_id":        job_id,
            "scene_meta":    scene_meta,
            "stats":         graph_stats,
            "outputs": {
                "normalised_tif":         str(norm_path),
                "seg_mask_tif":           str(seg_path),
                "roads_raw_shp":          str(raw_shp),
                "roads_classified_shp":   str(clf_shp),
                "roads_classified_csv":   str(clf_csv),
                "graph_graphml":          str(graphml),
                "graph_geojson":          str(graph_gj),
                "components_csv":         str(comp_csv),
                "report_pdf":             str(pdf_path),
                "report_zip":             str(zip_path),
            }
        }
