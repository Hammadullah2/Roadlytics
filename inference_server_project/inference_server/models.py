"""Load trained .pth model artefacts into memory.

Model architectures are sourced from road_pipeline to avoid duplication:
  Segmentation:    road_pipeline.segmentation.deeplabv3.build_model
  Classification:  road_pipeline.classification.efficientnet.build_model
"""

import logging
import sys
from pathlib import Path

import torch

from .config import settings, PIPELINE_CONFIG

log = logging.getLogger(__name__)

# Make road_pipeline importable (lives at repo root, one level above inference_server_project/)
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent   # proper fyp/
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from road_pipeline.segmentation.deeplabv3 import build_model as _build_seg_model        # noqa: E402
from road_pipeline.classification.efficientnet import build_model as _build_clf_model   # noqa: E402


def load_segmentation_model(config: dict, device: str) -> torch.nn.Module:
    """
    Load the DeepLabV3+ segmentation model from checkpoint.

    Architecture: DeepLabV3Plus(encoder='se_resnext101_32x4d', in_channels=4, classes=1)
    Defined once in road_pipeline.segmentation.deeplabv3 — imported here to avoid duplication.
    """
    weight_path = settings.artifacts_dir / config["seg_weight_file"]
    if not weight_path.exists():
        raise FileNotFoundError(
            f"Segmentation weights not found at {weight_path}. "
            f"Place 'road segmentation.pth' in {settings.artifacts_dir}/"
        )

    log.info("Loading segmentation weights from %s", weight_path)
    model = _build_seg_model(weight_path, device)
    log.info("DeepLabV3+ (SE-ResNeXt-101) loaded successfully on %s", device)
    return model


def load_classification_model(config: dict, device: str) -> torch.nn.Module | None:
    """
    Load the EfficientNet-B2 road condition classifier from checkpoint.

    Architecture: EfficientNet-B2 with 4-channel input adapter and 3-class head.
    Defined once in road_pipeline.classification.efficientnet — imported here.

    Returns None if the weight file is missing (allows pipeline to run in K-Means
    mode or with all segments tagged 'Unclassified').
    """
    weight_path = settings.artifacts_dir / config["clf_weight_file"]
    if not weight_path.exists():
        log.warning(
            "Classification weights not found at %s — "
            "P4 will use K-Means or mark all segments Unclassified. "
            "Place 'road_condition_model.pth' in %s/ to enable EfficientNet.",
            weight_path, settings.artifacts_dir,
        )
        return None

    log.info("Loading classification weights from %s", weight_path)
    model = _build_clf_model(weight_path, device)
    log.info("EfficientNet-B2 classifier loaded successfully on %s", device)
    return model
