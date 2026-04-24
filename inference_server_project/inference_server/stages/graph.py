"""Graph construction and connectivity analysis — P5 (Raster-based)."""

from pathlib import Path
import numpy as np
from scipy import ndimage
from heapq import heappush, heappop
import rasterio
import pandas as pd

def build_graph(
    seg_mask_path: Path,
    classified_tif_path: Path,
    output_dir: Path,
    config: dict,
    progress_callback=None,
) -> tuple:
    """
    Stage 5: Graph connectivity from raster masks (no vectorisation).
    
    Returns:
      (component_map.tif, betweenness_centrality.tif, connected_components.csv, stats)
    """
    if progress_callback:
        progress_callback(10, "Loading raster masks")
        
    condition_cost = config.get("condition_cost", {"Good": 1.0, "Damaged": 3.5, "Unpaved": 2.0})
    
    # Load rasters
    with rasterio.open(seg_mask_path) as src:
        seg_mask = src.read(1).astype(np.uint8)
        profile = src.profile
    
    with rasterio.open(classified_tif_path) as src:
        clf_mask = src.read(1).astype(np.uint8)
    
    if progress_callback:
        progress_callback(30, "Building cost map")
        
    # Build cost map
    cost_map = np.zeros_like(seg_mask, dtype=np.float32)
    # Mapping assumes 0=Good, 1=Damaged, 2=Unpaved based on typical classification outputs
    # Let's read from config if possible, else default:
    # Actually, road_pipeline/classification outputs separate class TIFFs, but also a 'combined' mask.
    # We'll assume classified_tif_path is the combined mask with classes 0, 1, 2.
    # The actual road_pipeline outputs: class_names = ["Good", "Damaged", "Unpaved"]
    for class_id, class_name in enumerate(["Good", "Damaged", "Unpaved"]):
        mask = (clf_mask == class_id) & (seg_mask == 1)
        cost_map[mask] = condition_cost.get(class_name, 2.0)
    
    if progress_callback:
        progress_callback(50, "Finding connected components")
        
    # Find connected components (4-connectivity)
    labeled, n_components = ndimage.label(
        seg_mask, 
        structure=[[0,1,0],[1,1,1],[0,1,0]]
    )
    
    # Per-component statistics
    comp_data = []
    for comp_id in range(1, n_components + 1):
        comp_mask = labeled == comp_id
        pixels = np.argwhere(comp_mask)
        
        if len(pixels) == 0:
            continue
        
        n_pixels = len(pixels)
        cost_sum = cost_map[comp_mask].sum()
        cost_km = (cost_sum * 10) / 1000  # assuming 10m resolution
        y_mean, x_mean = pixels.mean(axis=0)
        
        comp_data.append({
            "component_id": comp_id,
            "n_pixels": n_pixels,
            "cost_total": round(cost_sum, 2),
            "cost_km": round(cost_km, 3),
            "centroid_row": int(y_mean),
            "centroid_col": int(x_mean),
            "is_isolated": n_pixels < config.get("isolated_threshold_nodes", 50)
        })
    
    comp_df = pd.DataFrame(comp_data)
    comp_csv_path = output_dir / "connected_components.csv"
    if not comp_df.empty:
        comp_df.to_csv(comp_csv_path, index=False)
    else:
        # Write empty CSV with headers
        pd.DataFrame(columns=["component_id", "n_pixels", "cost_total", "cost_km", "centroid_row", "centroid_col", "is_isolated"]).to_csv(comp_csv_path, index=False)
    
    if progress_callback:
        progress_callback(70, "Computing betweenness centrality")
        
    # Write component map
    profile.update(dtype="uint16", count=1, nodata=0)
    comp_map_path = output_dir / "component_map.tif"
    with rasterio.open(comp_map_path, "w", **profile) as dst:
        dst.write(labeled.astype(np.uint16), 1)
    
    # Compute betweenness centrality (sampled Dijkstra)
    betweenness = np.zeros_like(seg_mask, dtype=np.float32)
    
    road_pixels = np.argwhere(seg_mask == 1)
    sample_size = min(300, len(road_pixels))
    if sample_size > 0:
        sample_indices = np.random.choice(len(road_pixels), sample_size, replace=False)
        
        for src_y, src_x in road_pixels[sample_indices]:
            dist = _dijkstra_raster(seg_mask, cost_map, (src_y, src_x))
            reachable = np.argwhere((seg_mask == 1) & (dist < np.inf))
            for dst_y, dst_x in reachable:
                # Heuristic: increment betweenness for pixels on path
                betweenness[dst_y, dst_x] += 1
        
        # Normalise
        if betweenness.max() > 0:
            betweenness = betweenness / betweenness.max()
    
    # Write betweenness map
    profile.update(dtype="float32", nodata=-1.0)
    bet_path = output_dir / "betweenness_centrality.tif"
    with rasterio.open(bet_path, "w", **profile) as dst:
        dst.write(betweenness, 1)
    
    stats = {
        "total_road_pixels": int(seg_mask.sum()),
        "total_components": int(n_components),
        "isolated_components": int((comp_df["is_isolated"]).sum()) if not comp_df.empty else 0,
        "largest_component_pixels": int(comp_df["n_pixels"].max()) if not comp_df.empty else 0,
        "avg_component_size": float(comp_df["n_pixels"].mean()) if not comp_df.empty else 0,
    }
    
    if progress_callback:
        progress_callback(100, "Graph analysis complete")
        
    return comp_map_path, bet_path, comp_csv_path, stats


def _dijkstra_raster(seg_mask, cost_map, start, connectivity=4):
    """Dijkstra on pixel grid."""
    H, W = seg_mask.shape
    dist = np.full((H, W), np.inf, dtype=np.float32)
    dist[start] = 0
    pq = [(0, start)]
    
    deltas = [(0, 1), (0, -1), (1, 0), (-1, 0)] if connectivity == 4 else [
        (0, 1), (0, -1), (1, 0), (-1, 0),
        (1, 1), (1, -1), (-1, 1), (-1, -1)
    ]
    
    while pq:
        d, (y, x) = heappop(pq)
        if d > dist[y, x]:
            continue
        
        for dy, dx in deltas:
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and seg_mask[ny, nx] == 1:
                new_dist = d + cost_map[ny, nx]
                if new_dist < dist[ny, nx]:
                    dist[ny, nx] = new_dist
                    heappush(pq, (new_dist, (ny, nx)))
    
    return dist
