from backend.app.services.reports import render_report_html


def test_render_report_uses_summary_aliases() -> None:
    html = render_report_html(
        job={
            "project_name": "Test Assessment",
            "description": "Synthetic report coverage",
            "status": "completed",
            "segmenter": "DeepLabV3",
            "classifier": "KMeans",
        },
        analytics={
            "total_components": 4,
            "isolated_components": 1,
            "largest_component_length_km": 2.75,
            "critical_junctions": 6,
        },
        artifacts=[
            {"label": "Combined Condition Mask", "filename": "combined.tif", "is_download": True},
            {"label": "Road Condition Shapefiles", "filename": "roads.zip", "is_download": True},
        ],
    )

    assert "Test Assessment" in html
    assert "Connected Components" in html
    assert "2.75" in html
    assert "6" in html
    assert "combined.tif" in html

