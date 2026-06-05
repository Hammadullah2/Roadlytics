"""
analytics/connectivity.py - Raster-first Stage 5 connectivity analytics.
"""

from __future__ import annotations

import csv
import json
import math
from heapq import heappop, heappush
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import numpy as np
from rasterio.transform import xy
from scipy import ndimage

from ..config import (
    CLASS_VALUES,
    CONNECTIVITY_BRANDES_NODE_LIMIT,
    CONNECTIVITY_COSTS,
    CONNECTIVITY_CRITICAL_PERCENTILE,
    CONNECTIVITY_ISOLATION_THRESHOLD,
    CONNECTIVITY_NEIGHBORHOOD,
    CONNECTIVITY_SAMPLE_LIMIT,
)
from ..io_utils import read_mask, write_float_raster, write_labeled_raster
from ..models import ConnectivityArtifacts

Coord = Tuple[int, int]


def _pixel_size_m(profile: dict) -> float:
    transform = profile["transform"]
    return float((abs(transform.a) + abs(transform.e)) / 2.0)


def _neighbor_deltas(connectivity: int) -> Sequence[Coord]:
    if connectivity == 8:
        return (
            (-1, -1), (-1, 0), (-1, 1),
            (0, -1),           (0, 1),
            (1, -1),  (1, 0),  (1, 1),
        )
    return ((-1, 0), (1, 0), (0, -1), (0, 1))


def _weighted_brandes(
    neighbors: Sequence[Sequence[Tuple[int, float]]],
    source_indices: Sequence[int],
) -> np.ndarray:
    """
    Approximate weighted betweenness centrality using sampled Brandes sources.
    """
    n_nodes = len(neighbors)
    centrality = np.zeros(n_nodes, dtype=np.float64)
    if n_nodes == 0 or not source_indices:
        return centrality.astype(np.float32)

    for source in source_indices:
        stack: List[int] = []
        predecessors: List[List[int]] = [[] for _ in range(n_nodes)]
        sigma = np.zeros(n_nodes, dtype=np.float64)
        sigma[source] = 1.0
        distances = np.full(n_nodes, np.inf, dtype=np.float64)
        distances[source] = 0.0
        queue: List[Tuple[float, int]] = [(0.0, source)]

        while queue:
            dist_v, vertex = heappop(queue)
            if dist_v > distances[vertex]:
                continue

            stack.append(vertex)
            for neighbor, weight in neighbors[vertex]:
                candidate = dist_v + weight
                if candidate + 1e-9 < distances[neighbor]:
                    distances[neighbor] = candidate
                    heappush(queue, (candidate, neighbor))
                    sigma[neighbor] = sigma[vertex]
                    predecessors[neighbor] = [vertex]
                elif abs(candidate - distances[neighbor]) <= 1e-9:
                    sigma[neighbor] += sigma[vertex]
                    predecessors[neighbor].append(vertex)

        dependency = np.zeros(n_nodes, dtype=np.float64)
        while stack:
            w = stack.pop()
            if sigma[w] == 0:
                continue
            scale = (1.0 + dependency[w]) / sigma[w]
            for v in predecessors[w]:
                dependency[v] += sigma[v] * scale
            if w != source:
                centrality[w] += dependency[w]

    scale = n_nodes / max(len(source_indices), 1)
    centrality *= scale
    if centrality.max() > 0:
        centrality /= centrality.max()
    return centrality.astype(np.float32)


def _local_junction_criticality(
    road_mask: np.ndarray,
    cost_map: np.ndarray,
    labeled: np.ndarray,
    component_sizes: np.ndarray,
    connectivity: int,
) -> np.ndarray:
    """
    Fast criticality proxy for large raster graphs.

    Exact betweenness is too expensive for multi-million-pixel road masks. This
    score prioritizes junction-like pixels in large components and higher-cost
    road-condition areas, producing a bounded map suitable for MVP analysis.
    """
    if connectivity == 8:
        kernel = np.ones((3, 3), dtype=np.uint8)
        kernel[1, 1] = 0
        max_degree = 8.0
    else:
        kernel = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], dtype=np.uint8)
        max_degree = 4.0

    degree = ndimage.convolve(road_mask.astype(np.uint8), kernel, mode="constant", cval=0)
    degree_score = np.clip((degree.astype(np.float32) - 1.0) / max(max_degree - 1.0, 1.0), 0.0, 1.0)
    junction_bonus = np.where(degree >= 3, 1.0, 0.35).astype(np.float32)

    safe_component_sizes = np.zeros_like(component_sizes, dtype=np.float32)
    if len(component_sizes) > 1:
        safe_component_sizes[1:] = component_sizes[1:].astype(np.float32)
    component_size_map = safe_component_sizes[labeled]
    max_component = float(component_size_map.max())
    component_score = (
        np.log1p(component_size_map) / math.log1p(max_component)
        if max_component > 0
        else np.zeros_like(component_size_map, dtype=np.float32)
    )

    max_cost = float(cost_map[road_mask > 0].max()) if np.any(road_mask > 0) else 0.0
    cost_score = (cost_map / max_cost) if max_cost > 0 else np.zeros_like(cost_map, dtype=np.float32)

    criticality = degree_score * junction_bonus * component_score.astype(np.float32) * np.maximum(cost_score, 0.25)
    criticality[road_mask == 0] = 0.0
    max_score = float(criticality.max())
    if max_score > 0:
        criticality = criticality / max_score
    return criticality.astype(np.float32)


def _write_components_csv(path: Path, rows: Sequence[Dict[str, object]]) -> None:
    fieldnames = [
        "component_id",
        "n_pixels",
        "estimated_length_km",
        "mean_cost",
        "total_cost",
        "centroid_row",
        "centroid_col",
        "centroid_x",
        "centroid_y",
        "is_isolated",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _write_critical_junctions_geojson(
    path: Path,
    critical_indices: Sequence[int],
    coords: np.ndarray,
    betweenness: np.ndarray,
    components: np.ndarray,
    profile: dict,
) -> None:
    features = []
    for order, idx in enumerate(critical_indices, start=1):
        row, col = coords[idx]
        x, y = xy(profile["transform"], row, col, offset="center")
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": f"CJ-{order:04d}",
                    "betweenness": float(round(float(betweenness[idx]), 6)),
                    "component_id": int(components[idx]),
                    "row": int(row),
                    "col": int(col),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(x), float(y)],
                },
            }
        )

    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, indent=2),
        encoding="utf-8",
    )


def run(
    seg_mask_path: Path,
    classified_tif_path: Path,
    output_dir: Path,
    condition_costs: Dict[str, float] | None = None,
    connectivity: int = CONNECTIVITY_NEIGHBORHOOD,
    isolation_threshold: int = CONNECTIVITY_ISOLATION_THRESHOLD,
    max_sources: int = CONNECTIVITY_SAMPLE_LIMIT,
    critical_percentile: float = CONNECTIVITY_CRITICAL_PERCENTILE,
) -> ConnectivityArtifacts:
    """
    Run Stage 5 connectivity analytics directly on raster masks.
    """
    seg_mask_path = Path(seg_mask_path)
    classified_tif_path = Path(classified_tif_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    if condition_costs is None:
        condition_costs = CONNECTIVITY_COSTS

    seg_mask, profile = read_mask(seg_mask_path)
    class_map, _ = read_mask(classified_tif_path)
    if seg_mask.shape != class_map.shape:
        raise ValueError(
            "Connectivity analysis requires segmentation and classification rasters with the same shape."
        )

    road_mask = (seg_mask > 0).astype(np.uint8)
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8)
    if connectivity == 8:
        structure = np.ones((3, 3), dtype=np.uint8)
    labeled, n_components = ndimage.label(road_mask, structure=structure)

    pixel_size_m = _pixel_size_m(profile)
    class_weights = {
        CLASS_VALUES["good"]: condition_costs["good"],
        CLASS_VALUES["unpaved"]: condition_costs["unpaved"],
        CLASS_VALUES["damaged"]: condition_costs["damaged"],
    }
    cost_map = np.zeros_like(class_map, dtype=np.float32)
    for class_value, cost in class_weights.items():
        cost_map[class_map == class_value] = cost

    coords = np.argwhere(road_mask == 1)
    if len(coords) == 0:
        raise ValueError("Connectivity analysis requires at least one road pixel.")

    component_sizes_by_id = np.bincount(labeled.ravel(), minlength=n_components + 1)
    component_per_index = labeled[coords[:, 0], coords[:, 1]].astype(np.uint32)
    if len(coords) > CONNECTIVITY_BRANDES_NODE_LIMIT:
        criticality_method = "local_junction_heuristic"
        betweenness_map = _local_junction_criticality(
            road_mask,
            cost_map,
            labeled,
            component_sizes_by_id,
            connectivity,
        )
        betweenness = betweenness_map[coords[:, 0], coords[:, 1]].astype(np.float32)
    else:
        criticality_method = "sampled_brandes"
        coord_to_index = {tuple(coord): idx for idx, coord in enumerate(coords.tolist())}
        neighbors: List[List[Tuple[int, float]]] = [[] for _ in range(len(coords))]
        for idx, (row, col) in enumerate(coords):
            for dy, dx in _neighbor_deltas(connectivity):
                ny, nx = row + dy, col + dx
                neighbor_index = coord_to_index.get((ny, nx))
                if neighbor_index is None:
                    continue
                travel_cost = float(cost_map[ny, nx] or 1.0)
                if dy != 0 and dx != 0:
                    travel_cost *= math.sqrt(2)
                neighbors[idx].append((neighbor_index, travel_cost))

        if len(coords) <= max_sources:
            source_indices = list(range(len(coords)))
        else:
            sample_positions = np.linspace(0, len(coords) - 1, num=max_sources, dtype=int)
            source_indices = sample_positions.tolist()

        betweenness = _weighted_brandes(neighbors, source_indices)
        betweenness_map = np.zeros_like(cost_map, dtype=np.float32)
        for idx, (row, col) in enumerate(coords):
            betweenness_map[row, col] = betweenness[idx]

    component_rows: List[Dict[str, object]] = []
    component_sizes = []
    component_costs = []
    for component_id in range(1, n_components + 1):
        component_mask = labeled == component_id
        pixels = np.argwhere(component_mask)
        if len(pixels) == 0:
            continue

        n_pixels = int(len(pixels))
        component_sizes.append(n_pixels)
        component_cost = float(cost_map[component_mask].sum())
        component_costs.append(component_cost)
        centroid_row, centroid_col = pixels.mean(axis=0)
        centroid_x, centroid_y = xy(
            profile["transform"],
            float(centroid_row),
            float(centroid_col),
            offset="center",
        )
        component_rows.append(
            {
                "component_id": component_id,
                "n_pixels": n_pixels,
                "estimated_length_km": round((n_pixels * pixel_size_m) / 1000.0, 3),
                "mean_cost": round(component_cost / max(n_pixels, 1), 4),
                "total_cost": round(component_cost, 4),
                "centroid_row": int(round(float(centroid_row))),
                "centroid_col": int(round(float(centroid_col))),
                "centroid_x": round(float(centroid_x), 3),
                "centroid_y": round(float(centroid_y), 3),
                "is_isolated": n_pixels < isolation_threshold,
            }
        )

    non_zero_betweenness = betweenness[betweenness > 0]
    threshold = (
        float(np.percentile(non_zero_betweenness, critical_percentile))
        if len(non_zero_betweenness)
        else 0.0
    )
    critical_indices = np.where(betweenness >= threshold)[0] if threshold > 0 else np.array([], dtype=int)
    if len(critical_indices) > 250:
        ranked = np.argsort(betweenness[critical_indices])[::-1][:250]
        critical_indices = critical_indices[ranked]

    component_map_path = output_dir / "component_map.tif"
    betweenness_path = output_dir / "betweenness_centrality.tif"
    components_csv_path = output_dir / "connected_components.csv"
    summary_json_path = output_dir / "analytics_summary.json"
    critical_geojson_path = output_dir / "critical_junctions.geojson"

    write_labeled_raster(component_map_path, labeled.astype(np.uint16), profile)
    write_float_raster(betweenness_path, betweenness_map, profile)
    _write_components_csv(components_csv_path, component_rows)
    _write_critical_junctions_geojson(
        critical_geojson_path,
        critical_indices.tolist(),
        coords,
        betweenness,
        component_per_index,
        profile,
    )

    stats = {
        "total_road_pixels": int(road_mask.sum()),
        "total_components": int(n_components),
        "component_count": int(n_components),
        "isolated_components": int(sum(1 for row in component_rows if row["is_isolated"])),
        "largest_component_pixels": int(max(component_sizes) if component_sizes else 0),
        "largest_component_length_km": float(
            max((row["estimated_length_km"] for row in component_rows), default=0.0)
        ),
        "average_component_pixels": float(round(float(np.mean(component_sizes)) if component_sizes else 0.0, 2)),
        "mean_component_cost": float(round(float(np.mean(component_costs)) if component_costs else 0.0, 4)),
        "critical_junctions": int(len(critical_indices)),
        "critical_junction_count": int(len(critical_indices)),
        "critical_threshold": float(round(threshold, 6)),
        "criticality_method": criticality_method,
        "criticality_node_count": int(len(coords)),
        "brandes_node_limit": int(CONNECTIVITY_BRANDES_NODE_LIMIT),
        "pixel_size_m": pixel_size_m,
    }
    summary_json_path.write_text(json.dumps(stats, indent=2), encoding="utf-8")

    return ConnectivityArtifacts(
        component_map=component_map_path,
        betweenness_map=betweenness_path,
        components_csv=components_csv_path,
        summary_json=summary_json_path,
        critical_junctions_geojson=critical_geojson_path,
        stats=stats,
    )
