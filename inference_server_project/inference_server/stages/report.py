"""Report generation — P6."""

from pathlib import Path
import zipfile
import rasterio
from rasterio.plot import show as rioshow
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
import contextily as ctx
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, HRFlowable, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from datetime import datetime


def _generate_maps(seg_tif: Path, combined_tif: Path, out_dir: Path) -> dict:
    """Generate 4 map PNG files for the report."""
    maps_dir = out_dir / "maps"
    maps_dir.mkdir(exist_ok=True)
    DPI = 130
    FIGSIZE = (9, 7)

    paths = {}

    # Map 1: Segmentation
    fig, ax = plt.subplots(figsize=FIGSIZE)
    with rasterio.open(seg_tif) as src:
        rioshow(src, ax=ax, cmap="Reds", alpha=0.6)
        try:
            ctx.add_basemap(
                ax, source=ctx.providers.Esri.WorldImagery,
                crs=src.crs.to_epsg(), zoom=12)
        except Exception:
            pass
    ax.set_axis_off()
    ax.set_title("Road segmentation", fontsize=12)
    p = maps_dir / "map2_segmentation.png"
    fig.savefig(p, dpi=DPI, bbox_inches="tight"); plt.close()
    paths["segmentation"] = p

    # Map 2: Condition classification
    fig, ax = plt.subplots(figsize=FIGSIZE)
    if combined_tif and combined_tif.exists():
        with rasterio.open(combined_tif) as src:
            rioshow(src, ax=ax, alpha=0.6)
            try:
                ctx.add_basemap(
                    ax, source=ctx.providers.CartoDB.Positron,
                    crs=src.crs.to_epsg(), zoom=12)
            except Exception:
                pass
    ax.set_axis_off()
    ax.set_title("Road condition classification", fontsize=12)
    p = maps_dir / "map3_condition.png"
    fig.savefig(p, dpi=DPI, bbox_inches="tight"); plt.close()
    paths["condition"] = p

    return paths


def _build_pdf(stats: dict, maps: dict, region: str,
               pdf_path: Path, report_id: str):
    """Build the final PDF report."""
    doc = SimpleDocTemplate(
        str(pdf_path), pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
    )
    styles = getSampleStyleSheet()
    s_title = ParagraphStyle("t", fontSize=18, alignment=TA_CENTER,
                              fontName="Helvetica-Bold", spaceAfter=6)
    s_h2   = ParagraphStyle("h2", fontSize=13, fontName="Helvetica-Bold",
                             spaceBefore=12, spaceAfter=4)
    story = []

    story.append(Paragraph("AI-Driven Road Quality Assessment", s_title))
    story.append(Paragraph(f"Report #{report_id}", s_title))
    story.append(HRFlowable(width="100%", thickness=1))
    story.append(Spacer(1, 0.3*cm))

    meta = [
        ["Region:",    region],
        ["Report ID:", report_id],
        ["Generated:", datetime.now().strftime("%Y-%m-%d %H:%M UTC")],
        ["Source:",    "User-uploaded Sentinel-2 GeoTIFF"],
    ]
    t = Table(meta, colWidths=[4*cm, 12*cm])
    t.setStyle(TableStyle([
        ("FONTNAME",(0,0),(0,-1),"Helvetica-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),10),
    ]))
    story.append(t); story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("Summary statistics", s_h2))
    summary = [
        ["Metric", "Value"],
        ["Total road pixels",       str(stats.get('total_road_pixels',0))],
        ["Connected components",    str(stats.get('total_components',0))],
        ["Isolated sub-networks",   str(stats.get('isolated_components',0))],
        ["Largest network pixels",  str(stats.get('largest_component_pixels',0))],
    ]
    t2 = Table(summary, colWidths=[9*cm, 7*cm])
    t2.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR",(0,0),(-1,0), colors.white),
        ("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),
        ("GRID",(0,0),(-1,-1),0.3,colors.grey),
        ("FONTSIZE",(0,0),(-1,-1),10),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),
         [colors.white, colors.HexColor("#eaf4fb")]),
    ]))
    story.append(t2)
    story.append(PageBreak())

    captions = {
        "segmentation": "Figure 1 — Road segmentation overlay",
        "condition":    "Figure 2 — Road condition classification",
    }
    for i, (key, label) in enumerate(captions.items()):
        if key in maps:
            story.append(Paragraph(label, s_h2))
            story.append(RLImage(str(maps[key]), width=15*cm, height=11*cm))
            story.append(Spacer(1, 0.3*cm))
            if i == 1:
                story.append(PageBreak())

    doc.build(story)


def generate_report(
    seg_tif:      Path,
    combined_tif: Path,
    comp_csv:     Path,
    stats:        dict,
    region:       str,
    output_dir:   Path,
    report_id:    str,
    progress_callback=None,
) -> tuple:
    """
    Generate full report including PDF, maps, and Shapefile zip.
    Returns (pdf path, zip path).
    """
    if progress_callback:
        progress_callback(10, "Generating maps")
    maps = _generate_maps(seg_tif, combined_tif, output_dir)

    if progress_callback:
        progress_callback(50, "Building PDF")
    pdf_path = output_dir / f"Assessment_Report_{report_id}.pdf"
    _build_pdf(stats, maps, region, pdf_path, report_id)

    if progress_callback:
        progress_callback(80, "Packaging deliverables")
    zip_path = output_dir / f"report_vector_{report_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if comp_csv and comp_csv.exists():
            zf.write(comp_csv, comp_csv.name)

    if progress_callback:
        progress_callback(100, "Report ready")

    return pdf_path, zip_path
