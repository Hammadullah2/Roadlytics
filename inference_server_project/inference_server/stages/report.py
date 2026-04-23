"""Report generation — P6."""

from pathlib import Path
import zipfile
import geopandas as gpd
import pandas as pd
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


def _generate_maps(roads_shp: Path, seg_tif: Path, out_dir: Path) -> dict:
    """Generate 4 map PNG files for the report."""
    maps_dir = out_dir / "maps"
    maps_dir.mkdir(exist_ok=True)
    DPI = 130
    FIGSIZE = (9, 7)

    roads = gpd.read_file(roads_shp).to_crs(epsg=3857)

    paths = {}

    # Map 1: Satellite imagery
    fig, ax = plt.subplots(figsize=FIGSIZE)
    roads.plot(ax=ax, color="white", linewidth=0.3, alpha=0.4)
    try:
        ctx.add_basemap(ax, source=ctx.providers.Esri.WorldImagery, zoom=12)
    except Exception:
        pass
    ax.set_axis_off()
    ax.set_title("Satellite imagery of AOI", fontsize=12)
    p = maps_dir / "map1_satellite.png"
    fig.savefig(p, dpi=DPI, bbox_inches="tight"); plt.close()
    paths["satellite"] = p

    # Map 2: Segmentation
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

    # Map 3: Condition classification
    cmap = {"Good":"#2ecc71","Damaged":"#e74c3c","Unpaved":"#95a5a6","Unclassified":"#f1c40f"}
    fig, ax = plt.subplots(figsize=FIGSIZE)
    for cond, col in cmap.items():
        sub = roads[roads["condition"] == cond]
        if not sub.empty:
            sub.plot(ax=ax, color=col, linewidth=1.5, label=cond)
    try:
        ctx.add_basemap(ax, source=ctx.providers.CartoDB.Positron, zoom=12)
    except Exception:
        pass
    ax.legend(loc="lower right")
    ax.set_axis_off()
    ax.set_title("Road condition classification", fontsize=12)
    p = maps_dir / "map3_condition.png"
    fig.savefig(p, dpi=DPI, bbox_inches="tight"); plt.close()
    paths["condition"] = p

    # Map 4: Connectivity
    fig, ax = plt.subplots(figsize=FIGSIZE)
    import random
    random.seed(42)
    for cid in roads["component_id"].unique():
        if pd.isna(cid):
            continue
        colr = f"#{random.randint(0,0xFFFFFF):06x}"
        roads[roads["component_id"] == cid].plot(
            ax=ax, color=colr, linewidth=1.2)
    try:
        ctx.add_basemap(ax, source=ctx.providers.CartoDB.Positron, zoom=12)
    except Exception:
        pass
    ax.set_axis_off()
    ax.set_title("Network connectivity (components)", fontsize=12)
    p = maps_dir / "map4_connectivity.png"
    fig.savefig(p, dpi=DPI, bbox_inches="tight"); plt.close()
    paths["connectivity"] = p

    return paths


def _build_pdf(stats: dict, maps: dict, region: str,
               scene_meta: dict, pdf_path: Path, report_id: str):
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
        ["Region:",           region],
        ["Report ID:",        report_id],
        ["Generated:",        datetime.now().strftime("%Y-%m-%d %H:%M UTC")],
        ["Sentinel-2 scene:", scene_meta.get("scene_id", "N/A")],
        ["Acquisition date:", scene_meta.get("acquisition_date", "N/A")],
        ["Cloud cover:",      f"{scene_meta.get('cloud_cover', 0)*100:.1f}%"],
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
        ["Total road length",       f"{stats.get('total_road_km',0)} km"],
        ["Total segments",          str(stats.get('total_edges',0))],
        ["Connected components",    str(stats.get('total_components',0))],
        ["Isolated sub-networks",   str(stats.get('isolated_components',0))],
        ["Largest network",         f"{stats.get('largest_network_km',0)} km"],
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
        "satellite":    "Figure 1 — Satellite imagery of AOI",
        "segmentation": "Figure 2 — Road segmentation overlay",
        "condition":    "Figure 3 — Road condition classification",
        "connectivity": "Figure 4 — Network connectivity",
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
    roads_shp:  Path,
    seg_tif:    Path,
    comp_csv:   Path,
    stats:      dict,
    region:     str,
    scene_meta: dict,
    output_dir: Path,
    report_id:  str,
    progress_callback=None,
) -> tuple:
    """
    Generate full report including PDF, maps, and Shapefile zip.
    Returns (pdf path, zip path).
    """
    if progress_callback:
        progress_callback(10, "Generating maps")
    maps = _generate_maps(roads_shp, seg_tif, output_dir)

    if progress_callback:
        progress_callback(50, "Building PDF")
    pdf_path = output_dir / f"Assessment_Report_{report_id}.pdf"
    _build_pdf(stats, maps, region, scene_meta, pdf_path, report_id)

    if progress_callback:
        progress_callback(80, "Packaging deliverables")
    zip_path = output_dir / f"report_vector_{report_id}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        shp_stem = roads_shp.with_suffix("")
        for ext in [".shp",".shx",".dbf",".prj"]:
            f = shp_stem.with_suffix(ext)
            if f.exists():
                zf.write(f, f.name)
        if comp_csv.exists():
            zf.write(comp_csv, comp_csv.name)

    if progress_callback:
        progress_callback(100, "Report ready")

    return pdf_path, zip_path
