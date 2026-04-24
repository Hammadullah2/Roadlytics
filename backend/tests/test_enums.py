from backend.app.enums import (
    display_classifier,
    display_segmenter,
    normalize_classifier,
    normalize_segmenter,
)


def test_normalize_segmenter_variants() -> None:
    assert normalize_segmenter("DeepLabV3") == "deeplab"
    assert normalize_segmenter("deeplab") == "deeplab"
    assert normalize_segmenter("PakOSM") == "osm"
    assert normalize_segmenter("osm") == "osm"


def test_normalize_classifier_variants() -> None:
    assert normalize_classifier("EfficientNet") == "efficientnet"
    assert normalize_classifier("efficient_net") == "efficientnet"
    assert normalize_classifier("KMeans") == "kmeans"
    assert normalize_classifier("k-means") == "kmeans"


def test_display_helpers() -> None:
    assert display_segmenter("deeplab") == "DeepLabV3"
    assert display_segmenter("osm") == "PakOSM"
    assert display_classifier("efficientnet") == "EfficientNet"
    assert display_classifier("kmeans") == "KMeans"

