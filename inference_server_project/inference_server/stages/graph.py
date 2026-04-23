"""Graph construction and connectivity analysis — P5."""

from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
import networkx as nx
import json


def node_key(coord, precision=1):
    """Create unique node identifier from coordinate."""
    return f"{round(coord[0], precision)}_{round(coord[1], precision)}"


def build_graph(
    clf_shp_path: Path,
    output_dir: Path,
    config: dict,
    progress_callback=None,
) -> tuple:
    """
    Build NetworkX graph, compute connectivity, export GraphML + GeoJSON.
    Returns (graphml path, geojson path, components csv path, stats dict).
    """
    if progress_callback:
        progress_callback(10, "Loading classified roads")

    roads = gpd.read_file(clf_shp_path).to_crs(config["target_crs"])
    G = nx.Graph()
    cond_cost = config["condition_cost"]

    for _, row in roads.iterrows():
        coords = list(row.geometry.coords)
        u = node_key(coords[0], config["node_key_precision"])
        v = node_key(coords[-1], config["node_key_precision"])
        if u == v:
            continue
        weight = float(row["length_m"]) * cond_cost.get(row["condition"], 2.0)

        if not G.has_node(u):
            G.add_node(u, x=coords[0][0], y=coords[0][1])
        if not G.has_node(v):
            G.add_node(v, x=coords[-1][0], y=coords[-1][1])

        G.add_edge(u, v,
                   weight     = weight,
                   length_m   = float(row["length_m"]),
                   condition  = str(row["condition"]),
                   confidence = float(row["confidence"]),
                   segment_id = int(row["road_id"]))

    if progress_callback:
        progress_callback(40, "Finding connected components")

    components = sorted(nx.connected_components(G), key=len, reverse=True)
    comp_lookup = {}
    for cid, comp_nodes in enumerate(components):
        for node in comp_nodes:
            comp_lookup[node] = cid

    nx.set_node_attributes(G, comp_lookup, name="component_id")

    if progress_callback:
        progress_callback(70, "Computing centrality")

    k_sample = min(300, G.number_of_nodes())
    if k_sample > 1:
        betweenness = nx.betweenness_centrality(
            G, k=k_sample, weight="weight", normalized=True)
    else:
        betweenness = {n: 0.0 for n in G.nodes()}
    nx.set_node_attributes(G, betweenness, name="betweenness")

    comp_records = []
    for cid, comp_nodes in enumerate(components):
        sub = G.subgraph(comp_nodes)
        tot_len = sum(d["length_m"] for _,_,d in sub.edges(data=True)) / 1000
        xs = [G.nodes[n]["x"] for n in comp_nodes]
        ys = [G.nodes[n]["y"] for n in comp_nodes]
        comp_records.append({
            "component_id":     cid,
            "n_nodes":          len(comp_nodes),
            "n_edges":          sub.number_of_edges(),
            "total_length_km":  round(tot_len, 3),
            "centroid_x_utm":   round(np.mean(xs), 1),
            "centroid_y_utm":   round(np.mean(ys), 1),
            "is_isolated":      len(comp_nodes) <= config["isolated_threshold_nodes"],
        })

    comp_df  = pd.DataFrame(comp_records)
    comp_csv = output_dir / "connected_components.csv"
    comp_df.to_csv(comp_csv, index=False)

    if progress_callback:
        progress_callback(85, "Writing outputs")

    roads["component_id"] = roads.geometry.apply(
        lambda g: comp_lookup.get(
            node_key(list(g.coords)[0], config["node_key_precision"]), -1))
    roads.to_file(clf_shp_path, driver="ESRI Shapefile")

    graphml_path = output_dir / "road_graph.graphml"
    G_ex = G.copy()
    for _, _, d in G_ex.edges(data=True):
        for k, v in d.items():
            if not isinstance(v, (int, float, str, bool)):
                d[k] = str(v)
    nx.write_graphml(G_ex, graphml_path)

    geojson_path = output_dir / "road_graph.geojson"
    roads_wgs = roads.to_crs("EPSG:4326")
    roads_wgs.to_file(geojson_path, driver="GeoJSON")

    stats = {
        "total_nodes":         G.number_of_nodes(),
        "total_edges":         G.number_of_edges(),
        "total_components":    len(components),
        "isolated_components": int(comp_df["is_isolated"].sum()),
        "total_road_km":       round(
            sum(d["length_m"] for _,_,d in G.edges(data=True)) / 1000, 2),
        "largest_network_km":  float(comp_df["total_length_km"].max())
                               if len(comp_df) else 0.0,
    }

    if progress_callback:
        progress_callback(100, "Graph analysis complete")

    return graphml_path, geojson_path, comp_csv, stats
