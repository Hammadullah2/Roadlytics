"""Shared enums and normalization helpers."""

from __future__ import annotations

from enum import Enum


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class JobStage(str, Enum):
    uploaded = "uploaded"
    validating = "validating"
    segmenting = "segmenting"
    classifying = "classifying"
    connectivity = "connectivity"
    packaging = "packaging"
    completed = "completed"
    failed = "failed"


class ArtifactType(str, Enum):
    sentinel = "sentinel"
    segmentation = "segmentation"
    good = "good"
    unpaved = "unpaved"
    damaged = "damaged"
    combined = "combined"
    shapefile_zip = "shapefile_zip"
    components = "components"
    betweenness = "betweenness"
    components_csv = "components_csv"
    analytics_summary = "analytics_summary"
    critical_junctions = "critical_junctions"
    report = "report"


_SEGMENTER_MAP = {
    "deeplab": "deeplab",
    "deeplabv3": "deeplab",
    "pakosm": "osm",
    "osm": "osm",
}

_CLASSIFIER_MAP = {
    "efficientnet": "efficientnet",
    "kmeans": "kmeans",
    "k-means": "kmeans",
}


def normalize_segmenter(value: str) -> str:
    key = value.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if key not in _SEGMENTER_MAP:
        raise ValueError("segmenter must be one of: DeepLabV3, PakOSM")
    return _SEGMENTER_MAP[key]


def normalize_classifier(value: str) -> str:
    key = value.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if key not in _CLASSIFIER_MAP:
        raise ValueError("classifier must be one of: KMeans, EfficientNet")
    return _CLASSIFIER_MAP[key]


def display_segmenter(value: str) -> str:
    return "DeepLabV3" if value == "deeplab" else "PakOSM"


def display_classifier(value: str) -> str:
    return "EfficientNet" if value == "efficientnet" else "KMeans"

