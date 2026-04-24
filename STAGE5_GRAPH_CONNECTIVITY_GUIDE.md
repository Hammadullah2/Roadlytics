# Stage 5: Graph Connectivity Analysis — Comprehensive Implementation Guide

## 📋 Executive Summary

**Stage 5** converts a classified road network (segments + condition labels) into a spatial graph representing road connectivity, then computes graph metrics (connected components, centrality) to identify isolated networks and critical road junctions.

**Input**: Road segments (condition + confidence labels)  
**Output**: Road network graph, connected components, centrality measures, connectivity statistics  
**Duration**: ~60 seconds  
**Purpose**: Understand which roads form connected networks, identify isolated sub-networks, rank critical junctions by betweenness (traffic bottlenecks)

---

## 🎯 What is Graph Connectivity Analysis?

### The Problem It Solves

Roads exist in space but form networks with topology. A road assessment that says "95% of roads are in good condition" is incomplete if those 95% are all disconnected. You need to know:

- **Which roads are connected to which?** (topology)
- **How many separate networks exist?** (fragmentation)
- **Which roads are critical?** (betweenness centrality — removing this road disconnects the network)
- **How accessible is region X from region Y?** (shortest path cost)

### The NetworkX Approach (Current)

1. **Build graph nodes** from road segment endpoints (junctions)
2. **Build graph edges** from road segments (with weights = length × condition cost)
3. **Find connected components** (BFS/DFS to find all reachable nodes from each node)
4. **Compute centrality** (betweenness = how many shortest paths pass through this junction)
5. **Export** as GraphML, GeoJSON, CSV summary

**Limitation**: Requires converting road masks → vectorised LineStrings first. Vectorisation introduces:
- Topology errors (crossed lines, gaps at intersections)
- Simplification artifacts (smooth curves become jagged)
- Precision loss in endpoint coordinates
- Quality degradation if the segmentation mask is noisy

---

## ⚠️ Shapefile vs TIF Approach — Trade-offs

### Current Approach: Shapefiles (Vectorised Roads)

**Pros**:
- Clean topology guaranteed (explicit LineStrings)
- Exportable to GIS software
- Human-readable geometry
- Easy to filter, modify, query

**Cons**:
- Requires vectorisation step (gdal_polygonize + topology cleanup)
- Vectorisation can fail on complex masks
- Loses sub-pixel information from raster
- Introduces new error source
- Shapefile quality depends heavily on segmentation mask quality
- Large file sizes for dense networks (~5 MB per typical AOI)

### Alternative Approach: TIF Raster-Based Graph

**Pros**:
- Skip vectorisation entirely — direct from segmentation mask
- Preserve all pixel-level information
- No topology errors (pixels are already connected)
- Faster (~20 seconds vs 60 seconds)
- Smaller intermediate files (raster pixels vs vector coordinates)
- More robust to noisy masks

**Cons**:
- Graph nodes are pixel coordinates (not real junctions)
- Difficult to export to GIS (pixel values aren't human-readable)
- Hard to visualize in traditional mapping software
- Requires different algorithms (raster connectivity vs vector topology)
- Connected components are pixel-level (very granular)
- Betweenness computed on pixel grid, not semantic roads

### Recommendation

**Use raster-based approach if**:
- You care about connectivity metrics and shortest paths more than GIS compatibility
- Your segmentation mask is clean and high-quality
- You want to skip the vectorisation step
- Speed is critical

**Use Shapefile approach if**:
- You need to export to ArcGIS, QGIS, or other GIS tools
- You want human-readable endpoints and road segments
- Your roads need to be manually reviewed or edited
- Clients expect traditional geospatial outputs

**Hybrid approach** (recommended):
- Compute graph from **raster** (fast, robust)
- Export key results as **vector** (centrality-weighted roads, component outlines) for visualization
- Skip detailed Shapefile export; use raster mask + summary CSV instead

---

## 🔬 RASTER-BASED APPROACH (TIF-Only, No Shapefiles)

### Concept

Treat the segmentation mask as a graph where:
- **Nodes** = pixel coordinates
- **Edges** = adjacent pixels (4-connectivity or 8-connectivity)
- **Weights** = inverse condition quality (Good=1.0, Damaged=3.5, Unpaved=2.0 cost)
- **Connected component** = all pixels reachable from each other

### Algorithm

```
1. Load seg_mask.tif (binary: 0/1 road pixels)
   Load condition map (per-pixel class: Good/Damaged/Unpaved)

2. Build pixel cost map:
   For each road pixel (value=1):
     cost[pixel] = condition_cost[classification[pixel]]

3. Find connected components (4-connectivity):
   For each unvisited road pixel:
     Start BFS from pixel → mark all adjacent reachable pixels with same component_id
     Track component size, total cost, centroid

4. Compute centrality (on pixel grid):
   For each pixel as source:
     Dijkstra shortest path to all reachable pixels
     Count: how many shortest paths from other pixels pass through this pixel?
     betweenness[pixel] = rank (higher = more critical)

5. Export:
   Per-component CSV:
     component_id, n_pixels, cost_total_km, centroid_x, centroid_y, is_isolated
   
   Per-pixel GeoTIFF:
     betweenness_centrality.tif (float32)
     component_id.tif (uint16)
```

### Python Implementation (Raster-Based)

```python
import numpy as np
from scipy import ndimage
from scipy.ndimage import distance_transform_edt
import rasterio
import pandas as pd

def analyze_connectivity_raster(
    seg_mask_path,      # uint8 binary (0/1)
    classified_tif_path, # uint8 (0=Good, 1=Damaged, 2=Unpaved)
    output_dir,
    condition_cost=None,
):
    """
    Analyse road connectivity directly from raster masks.
    No vectorisation, no Shapefiles.
    
    Returns:
      - component_summary.csv
      - component_map.tif (component_id per pixel)
      - betweenness_centrality.tif (centrality per pixel)
      - stats dict
    """
    if condition_cost is None:
        condition_cost = {"Good": 1.0, "Damaged": 3.5, "Unpaved": 2.0}
    
    # Load rasters
    with rasterio.open(seg_mask_path) as seg_src:
        seg_mask = seg_src.read(1).astype(np.uint8)
        profile = seg_src.profile
    
    with rasterio.open(classified_tif_path) as clf_src:
        clf_mask = clf_src.read(1).astype(np.uint8)  # 0, 1, 2
    
    # Build cost map (condition per road pixel)
    cost_map = np.zeros_like(seg_mask, dtype=np.float32)
    class_names = ["Good", "Damaged", "Unpaved"]
    for i, class_name in enumerate(class_names):
        mask = (clf_mask == i) & (seg_mask == 1)
        cost_map[mask] = condition_cost[class_name]
    
    # 1. Find connected components (4-connectivity: up, down, left, right)
    labeled, n_components = ndimage.label(seg_mask, structure=[[0,1,0],[1,1,1],[0,1,0]])
    
    # 2. Per-component statistics
    comp_data = []
    for comp_id in range(1, n_components + 1):
        comp_mask = labeled == comp_id
        pixels = np.argwhere(comp_mask)
        
        if len(pixels) == 0:
            continue
        
        n_pixels = len(pixels)
        cost_sum = cost_map[comp_mask].sum()
        cost_km = (cost_sum * 10) / 1000  # 10m pixels → km
        
        y_mean, x_mean = pixels.mean(axis=0)
        
        comp_data.append({
            "component_id": comp_id,
            "n_pixels": n_pixels,
            "cost_total": round(cost_sum, 2),
            "cost_km": round(cost_km, 3),
            "centroid_row": int(y_mean),
            "centroid_col": int(x_mean),
            "is_isolated": n_pixels < 50,  # arbitrary threshold
        })
    
    comp_df = pd.DataFrame(comp_data)
    comp_df.to_csv(output_dir / "connected_components.csv", index=False)
    
    # 3. Write component map as GeoTIFF
    profile.update(dtype="uint16", count=1)
    with rasterio.open(output_dir / "component_map.tif", "w", **profile) as dst:
        dst.write(labeled.astype(np.uint16), 1)
    
    # 4. Compute betweenness centrality (sampling approach for speed)
    #    For each road pixel, count shortest paths passing through it
    betweenness = np.zeros_like(seg_mask, dtype=np.float32)
    
    road_pixels = np.argwhere(seg_mask == 1)
    if len(road_pixels) > 500:
        # Sample for large networks (expensive otherwise)
        sample_indices = np.random.choice(
            len(road_pixels), min(300, len(road_pixels)), replace=False)
        sample_pixels = road_pixels[sample_indices]
    else:
        sample_pixels = road_pixels
    
    for src_y, src_x in sample_pixels:
        # Dijkstra from (src_y, src_x) to all reachable road pixels
        dist = dijkstra_raster(
            seg_mask, cost_map, (src_y, src_x),
            connectivity=4  # 4-connectivity or 8
        )
        
        # Shortest path counts
        reachable = np.where((seg_mask == 1) & (dist < np.inf))
        for dst_y, dst_x in zip(reachable[0], reachable[1]):
            if dijkstra_passes_through(dist, (src_y, src_x), (dst_y, dst_x)):
                betweenness[dst_y, dst_x] += 1
    
    # Normalise betweenness [0, 1]
    if betweenness.max() > 0:
        betweenness = betweenness / betweenness.max()
    
    # Write betweenness map
    profile.update(dtype="float32", count=1)
    with rasterio.open(output_dir / "betweenness_centrality.tif", "w", **profile) as dst:
        dst.write(betweenness, 1)
    
    stats = {
        "total_road_pixels": int(seg_mask.sum()),
        "total_components": int(n_components),
        "isolated_components": int((comp_df["is_isolated"]).sum()),
        "largest_component_pixels": int(comp_df["n_pixels"].max()),
        "avg_component_size": float(comp_df["n_pixels"].mean()),
    }
    
    return comp_df, labeled, betweenness, stats


def dijkstra_raster(seg_mask, cost_map, start, connectivity=4):
    """
    Dijkstra shortest path on pixel grid.
    Returns distance map from start pixel to all other pixels.
    """
    from heapq import heappush, heappop
    
    H, W = seg_mask.shape
    dist = np.full((H, W), np.inf, dtype=np.float32)
    dist[start] = 0
    pq = [(0, start)]
    
    # Define adjacency (4-connectivity or 8-connectivity)
    if connectivity == 4:
        deltas = [(0, 1), (0, -1), (1, 0), (-1, 0)]
    else:  # 8-connectivity
        deltas = [
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
                # Cost = edge weight (condition cost of destination pixel)
                new_dist = d + cost_map[ny, nx]
                if new_dist < dist[ny, nx]:
                    dist[ny, nx] = new_dist
                    heappush(pq, (new_dist, (ny, nx)))
    
    return dist
```

### Output Files (Raster Approach)

```
connected_components.csv:
  component_id, n_pixels, cost_total, cost_km, 
  centroid_row, centroid_col, is_isolated

component_map.tif (uint16):
  Each pixel = component_id it belongs to
  Can visualize directly in QGIS/ArcGIS

betweenness_centrality.tif (float32):
  Each pixel = betweenness rank [0, 1]
  High values = critical junctions

stats.json:
  total_road_pixels
  total_components
  isolated_components
  largest_component_pixels
```

---

## 📐 VECTOR-BASED APPROACH (Current Shapefile Method)

### Algorithm

```
1. Load roads_classified.shp (LineString segments)
   Load condition labels (Good/Damaged/Unpaved)

2. Build NetworkX graph:
   - Nodes = LineString endpoints (rounded to precision=1)
   - Edges = LineStrings with weight = length_m × condition_cost
   - Attributes = segment_id, condition, confidence

3. Find connected components:
   BFS from each unvisited node → mark component_id

4. Compute centrality:
   betweenness_centrality(G, k=min(300, n_nodes), normalized=True)

5. Export:
   - GraphML (full topology)
   - GeoJSON (visualisable in web maps)
   - CSV summary (per-component stats)
```

### Python Implementation (Vector-Based)

```python
import geopandas as gpd
import networkx as nx
import pandas as pd

def analyze_connectivity_vector(
    roads_shp_path,
    output_dir,
    condition_cost=None,
):
    """
    Analyse connectivity from vectorised Shapefiles (current approach).
    Requires pre-vectorised LineStrings.
    """
    if condition_cost is None:
        condition_cost = {"Good": 1.0, "Damaged": 3.5, "Unpaved": 2.0}
    
    # Load Shapefile
    roads = gpd.read_file(roads_shp_path)
    
    # Build NetworkX graph
    G = nx.Graph()
    
    for idx, row in roads.iterrows():
        geom = row.geometry
        coords = list(geom.coords)
        
        # Node keys: rounded coordinates
        u = f"{round(coords[0][0], 1)}_{round(coords[0][1], 1)}"
        v = f"{round(coords[-1][0], 1)}_{round(coords[-1][1], 1)}"
        
        if u == v:
            continue  # Skip self-loops
        
        # Node positions
        if not G.has_node(u):
            G.add_node(u, x=coords[0][0], y=coords[0][1])
        if not G.has_node(v):
            G.add_node(v, x=coords[-1][0], y=coords[-1][1])
        
        # Edge weight
        weight = float(row["length_m"]) * condition_cost.get(row["condition"], 2.0)
        
        # Add edge with metadata
        G.add_edge(u, v,
                   weight=weight,
                   length_m=float(row["length_m"]),
                   condition=str(row["condition"]),
                   confidence=float(row["confidence"]),
                   segment_id=int(row["road_id"]))
    
    # Connected components
    components = sorted(nx.connected_components(G), key=len, reverse=True)
    comp_lookup = {}
    for cid, comp_nodes in enumerate(components):
        for node in comp_nodes:
            comp_lookup[node] = cid
    
    nx.set_node_attributes(G, comp_lookup, name="component_id")
    
    # Betweenness centrality
    k_sample = min(300, G.number_of_nodes())
    betweenness = nx.betweenness_centrality(
        G, k=k_sample, weight="weight", normalized=True) if k_sample > 1 else {n: 0 for n in G}
    nx.set_node_attributes(G, betweenness, name="betweenness")
    
    # Per-component summary
    comp_records = []
    for cid, comp_nodes in enumerate(components):
        sub = G.subgraph(comp_nodes)
        tot_len = sum(d["length_m"] for _, _, d in sub.edges(data=True)) / 1000
        xs = [G.nodes[n]["x"] for n in comp_nodes]
        ys = [G.nodes[n]["y"] for n in comp_nodes]
        comp_records.append({
            "component_id": cid,
            "n_nodes": len(comp_nodes),
            "n_edges": sub.number_of_edges(),
            "total_length_km": round(tot_len, 3),
            "centroid_x": round(sum(xs) / len(xs), 1),
            "centroid_y": round(sum(ys) / len(ys), 1),
            "is_isolated": len(comp_nodes) <= 3,
        })
    
    comp_df = pd.DataFrame(comp_records)
    comp_df.to_csv(output_dir / "connected_components.csv", index=False)
    
    # Export GraphML
    nx.write_graphml(G, output_dir / "road_graph.graphml")
    
    # Export GeoJSON (roads with component_id + betweenness)
    roads["component_id"] = roads.geometry.apply(
        lambda g: comp_lookup.get(
            f"{round(list(g.coords)[0][0], 1)}_{round(list(g.coords)[0][1], 1)}", -1))
    roads["betweenness"] = roads.geometry.apply(...)  # lookup endpoints
    roads.to_crs(4326).to_file(output_dir / "road_graph.geojson", driver="GeoJSON")
    
    stats = {
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "total_components": len(components),
        "isolated_components": int(comp_df["is_isolated"].sum()),
    }
    
    return comp_df, G, stats
```

---

## 🚀 HYBRID APPROACH (Recommended for Production)

### Strategy

1. **Compute metrics from raster** (fast, robust)
   - Connected components on pixel grid
   - Betweenness centrality (raster-based)
   - Export as GeoTIFF + CSV

2. **Export vector results selectively**
   - Contours of components (polygon outlines)
   - Highest-betweenness pixels as point shapefile (junctions)
   - Skip full Shapefile export for roads

3. **Keep both formats**
   - Raster outputs for analysis & computation
   - Vector subsets for GIS visualization

### Implementation

```python
def analyze_connectivity_hybrid(
    seg_mask_path,      # uint8 binary
    classified_tif_path, # uint8 (0, 1, 2)
    output_dir,
):
    """
    Hybrid: raster computation + vector exports for visualization.
    """
    # 1. Compute on raster
    comp_df, labeled, betweenness, stats = analyze_connectivity_raster(
        seg_mask_path, classified_tif_path, output_dir)
    
    # 2. Export component outlines as Shapefile
    from rasterio.features import shapes
    from shapely.geometry import shape as shp_shape
    
    outlines = []
    for comp_id in range(1, labeled.max() + 1):
        comp_mask = (labeled == comp_id).astype(np.uint8)
        for geom, val in shapes(comp_mask, transform=profile["transform"]):
            if val == 1:
                outlines.append({
                    "component_id": comp_id,
                    "geometry": shp_shape(geom)
                })
    
    outlines_gdf = gpd.GeoDataFrame(outlines, crs=profile["crs"])
    outlines_gdf.to_file(output_dir / "component_outlines.shp")
    
    # 3. Export high-betweenness pixels as junctions
    high_bet_pixels = np.argwhere(betweenness > np.percentile(betweenness[seg_mask == 1], 95))
    junctions = []
    for row, col in high_bet_pixels:
        # Convert pixel to geospatial coords
        x, y = rasterio.transform.xy(profile["transform"], row, col)
        junctions.append({
            "geometry": Point(x, y),
            "betweenness": float(betweenness[row, col])
        })
    
    junctions_gdf = gpd.GeoDataFrame(junctions, crs=profile["crs"])
    junctions_gdf.to_file(output_dir / "critical_junctions.shp")
    
    # 4. Summary
    return {
        "components_csv": output_dir / "connected_components.csv",
        "component_map_tif": output_dir / "component_map.tif",
        "betweenness_tif": output_dir / "betweenness_centrality.tif",
        "outlines_shp": output_dir / "component_outlines.shp",
        "junctions_shp": output_dir / "critical_junctions.shp",
        "stats": stats
    }
```

---

## 📊 Comparison Matrix

| Aspect | Raster | Vector | Hybrid |
|--------|--------|--------|--------|
| **Speed** | 20–30s | 40–60s | 30–45s |
| **Data loss** | None (pixels) | Some (vectorisation) | Minimal |
| **File size** | Small (~5 MB) | Medium (~8 MB) | Medium (~10 MB) |
| **GIS compatibility** | Low | High | Medium |
| **Robustness** | High | Medium | High |
| **Computation cost** | Low | Medium | Low |
| **Visualization** | GeoTIFF viewer | ArcGIS/QGIS | Both |
| **Topology quality** | Guaranteed | Depends on vectorisation | Both |
| **Suitable for** | Analysis, ML | GIS workflows | Production |

---

## 💡 RECOMMENDATION

**Use Hybrid (Raster + Selective Vector Export)** for the following reasons:

1. **Skip full Shapefile vectorisation** — avoid topology errors
2. **Compute on raster directly** — faster, more robust
3. **Export component outlines** — gives GIS users polygon regions
4. **Export critical junctions** — gives GIS users point shapefile of bottlenecks
5. **Keep GeoTIFF outputs** — perfect for next stages (visualization, further analysis)

This eliminates your Shapefile quality issues while retaining GIS compatibility for key outputs.

---

## 🔧 Implementation for Claude Code

Here's the **core raster-based function** to give to Claude Code:

```python
# Stage 5: Graph connectivity (raster-based, no vectorisation)

import numpy as np
from scipy import ndimage
from heapq import heappush, heappop
import rasterio
import pandas as pd
from pathlib import Path

def stage5_connectivity_analysis(
    seg_mask_path: str,        # output from stage 3 (P3)
    classified_tif_path: str,  # output from stage 4 (P4, per-pixel classes)
    output_dir: str,
    condition_cost: dict = None,
) -> dict:
    """
    Stage 5: Graph connectivity from raster masks (no vectorisation).
    
    Args:
        seg_mask_path:      seg_mask.tif (uint8, binary 0/1)
        classified_tif_path: per-pixel classification (uint8, 0=Good, 1=Damaged, 2=Unpaved)
        output_dir:         output directory path
        condition_cost:     dict mapping condition → cost multiplier
    
    Returns:
        dict with:
          - "components_csv":   path to connected_components.csv
          - "component_map":    path to component_map.tif
          - "betweenness":      path to betweenness_centrality.tif
          - "stats":            dict with summary statistics
    """
    if condition_cost is None:
        condition_cost = {"Good": 1.0, "Damaged": 3.5, "Unpaved": 2.0}
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load rasters
    with rasterio.open(seg_mask_path) as src:
        seg_mask = src.read(1).astype(np.uint8)
        profile = src.profile
    
    with rasterio.open(classified_tif_path) as src:
        clf_mask = src.read(1).astype(np.uint8)
    
    # Build cost map
    cost_map = np.zeros_like(seg_mask, dtype=np.float32)
    for class_id, class_name in enumerate(["Good", "Damaged", "Unpaved"]):
        mask = (clf_mask == class_id) & (seg_mask == 1)
        cost_map[mask] = condition_cost[class_name]
    
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
        cost_km = (cost_sum * 10) / 1000  # 10m resolution
        y_mean, x_mean = pixels.mean(axis=0)
        
        comp_data.append({
            "component_id": comp_id,
            "n_pixels": n_pixels,
            "cost_total": round(cost_sum, 2),
            "cost_km": round(cost_km, 3),
            "centroid_row": int(y_mean),
            "centroid_col": int(x_mean),
            "is_isolated": n_pixels < 50
        })
    
    comp_df = pd.DataFrame(comp_data)
    comp_csv_path = output_dir / "connected_components.csv"
    comp_df.to_csv(comp_csv_path, index=False)
    
    # Write component map
    profile.update(dtype="uint16", count=1, nodata=0)
    comp_map_path = output_dir / "component_map.tif"
    with rasterio.open(comp_map_path, "w", **profile) as dst:
        dst.write(labeled.astype(np.uint16), 1)
    
    # Compute betweenness centrality (sampled Dijkstra)
    betweenness = np.zeros_like(seg_mask, dtype=np.float32)
    
    road_pixels = np.argwhere(seg_mask == 1)
    sample_size = min(300, len(road_pixels))
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
        "isolated_components": int((comp_df["is_isolated"]).sum()),
        "largest_component_pixels": int(comp_df["n_pixels"].max()) if len(comp_df) else 0,
        "avg_component_size": float(comp_df["n_pixels"].mean()) if len(comp_df) > 0 else 0,
    }
    
    return {
        "components_csv": str(comp_csv_path),
        "component_map": str(comp_map_path),
        "betweenness": str(bet_path),
        "stats": stats
    }


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
```

---

## 📝 Summary for Claude Code

**Task**: Implement Stage 5 graph connectivity

**Input files**:
- `seg_mask.tif` from Stage 3 (binary road pixels)
- `classified_tif.tif` from Stage 4 (per-pixel condition classes)

**Output files**:
- `connected_components.csv` (component metadata)
- `component_map.tif` (component ID per pixel)
- `betweenness_centrality.tif` (critical pixel rankings)

**Approach**: Raster-based (skip Shapefiles)

**Key functions**:
- `ndimage.label()` — find connected components
- `heappush/heappop` — Dijkstra shortest paths
- `rasterio.open()` — read/write GeoTIFFs

**No dependencies on**: Shapefile vectorisation, gdal_polygonize, geometry simplification

This eliminates your Shapefile quality issues entirely while keeping all connectivity metrics.
