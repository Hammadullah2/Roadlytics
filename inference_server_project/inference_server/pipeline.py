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

        if self.clf_model is None:
            log.warning(
                "[InferencePipeline] Classifier not loaded — P4 will assign "
                "'Unclassified' to all road segments."
            )
        log.info("[InferencePipeline] ready on %s", self.device)
        print(f"[InferencePipeline] ready on {self.device}")


    # Frontend sends "osm"/"deeplabv3" and "kmeans"/"efficientnet";
    # config keys use "osm"/"deeplab" and "kmeans"/"efficientnet".
    _SEG_MODEL_MAP = {"deeplabv3": "deeplab", "osm": "osm"}
    _CLF_MODEL_MAP = {"efficientnet": "efficientnet", "kmeans": "kmeans"}

    def run_on_tif(
        self,
        tif_path:    Path,
        region_name: str,
        progress_callback: Optional[Callable] = None,
        seg_model: Optional[str] = None,
        clf_model: Optional[str] = None,
    ) -> dict:
        """Run pipeline on a pre-supplied GeoTIFF (bypasses SentinelHub fetch)."""
        job_id  = uuid.uuid4().hex[:8].upper()
        job_dir = settings.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        cb = progress_callback or (lambda s, p, m: None)

        config = dict(self.config)
        if seg_model and seg_model in self._SEG_MODEL_MAP:
            config["segmenter"] = self._SEG_MODEL_MAP[seg_model]
        if clf_model and clf_model in self._CLF_MODEL_MAP:
            config["classifier"] = self._CLF_MODEL_MAP[clf_model]

        try:
            return self._run_pipeline(
                tif_path    = tif_path,
                job_id      = job_id,
                job_dir     = job_dir,
                region_name = region_name,
                callback    = cb,
                config      = config,
            )
        except Exception as e:
            log.exception("Pipeline failed for job %s", job_id)
            return {
                "status":        "error",
                "job_id":        job_id,
                "error_message": str(e),
            }

    def _run_pipeline(self, tif_path, job_id, job_dir, region_name, callback, config=None):
        """Internal method running all 6 pipeline stages."""
        if config is None:
            config = self.config

        # ── P1+P2: Preprocess ──────────────────────────────────────────────
        callback("preprocess", 0, "Starting preprocessing")
        norm_path = preprocess(
            tif_path, job_dir, config,
            progress_callback=lambda p, m: callback("preprocess", p, m),
        )

        # ── P3: Segment ────────────────────────────────────────────────────
        callback("segment", 0, "Starting segmentation")
        seg_path = segment(
            norm_path, job_dir, self.seg_model, config, self.device,
            progress_callback=lambda p, m: callback("segment", p, m),
            raw_tif_path=tif_path,
        )

        # ── P4: Classify ───────────────────────────────────────────────────
        callback("classify", 0, "Starting classification")
        clf_outputs = classify(
            norm_path, job_dir, self.clf_model, config, self.device,
            progress_callback=lambda p, m: callback("classify", p, m),
            seg_path=seg_path,
        )
        combined_tif_path = clf_outputs["combined"]
        good_tif_path     = clf_outputs.get("good")
        damaged_tif_path  = clf_outputs.get("damaged")
        unpaved_tif_path  = clf_outputs.get("unpaved")

        # ── P5: Graph ─────────────────────────────────────────────────────
        callback("graph", 0, "Building road graph")
        comp_map_tif, bet_tif, comp_csv, graph_stats = build_graph(
            seg_mask_path=seg_path,
            classified_tif_path=combined_tif_path,
            output_dir=job_dir,
            config=config,
            progress_callback=lambda p, m: callback("graph", p, m),
        )

        # ── P6: Report ─────────────────────────────────────────────────────
        callback("report", 0, "Generating report")
        pdf_path, zip_path = generate_report(
            seg_tif      = seg_path,
            combined_tif = combined_tif_path,
            comp_csv     = comp_csv,
            stats        = graph_stats,
            region       = region_name,
            output_dir   = job_dir,
            report_id    = job_id,
            progress_callback=lambda p, m: callback("report", p, m),
        )

        callback("complete", 100, "All stages finished")

        outputs = {
            "normalised_tif":    str(norm_path),
            "seg_mask_tif":      str(seg_path),
            "combined_tif":      str(combined_tif_path),
            "component_map_tif": str(comp_map_tif),
            "betweenness_tif":   str(bet_tif),
            "components_csv":    str(comp_csv),
            "report_pdf":        str(pdf_path),
            "report_zip":        str(zip_path),
        }
        if good_tif_path:
            outputs["good_tif"] = str(good_tif_path)
        if damaged_tif_path:
            outputs["damaged_tif"] = str(damaged_tif_path)
        if unpaved_tif_path:
            outputs["unpaved_tif"] = str(unpaved_tif_path)

        return {
            "status":  "success",
            "job_id":  job_id,
            "stats":   graph_stats,
            "outputs": outputs,
        }
