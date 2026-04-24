"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useState } from "react";
import type { GeoJsonObject } from "geojson";
import { circleMarker, type LatLngBoundsExpression } from "leaflet";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
} from "react-leaflet";

import { BASEMAP_ATTRIBUTION, BASEMAP_TILE_URL } from "@/lib/config";
import type { JobDetail, LayerModel } from "@/lib/types";

function BoundsController({ bounds }: { bounds?: number[] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds || bounds.length !== 4) {
      return;
    }
    const target: LatLngBoundsExpression = [
      [bounds[1], bounds[0]],
      [bounds[3], bounds[2]],
    ];
    map.fitBounds(target, { padding: [24, 24] });
  }, [map, bounds?.join(",")]);

  return null;
}

function defaultVisibility(layers: LayerModel[]) {
  return Object.fromEntries(layers.map((layer) => [layer.name, layer.default_visible]));
}

export default function MapAnalysis({ job }: { job: JobDetail }) {
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>(
    defaultVisibility(job.layers),
  );
  const [criticalJunctions, setCriticalJunctions] = useState<GeoJsonObject | null>(null);

  useEffect(() => {
    setVisibleLayers(defaultVisibility(job.layers));
  }, [job.id]);

  useEffect(() => {
    const vectorLayer = job.layers.find((layer) => layer.name === "critical_junctions");
    if (!vectorLayer?.data_url || !visibleLayers.critical_junctions) {
      setCriticalJunctions(null);
      return;
    }

    let cancelled = false;
    fetch(vectorLayer.data_url)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setCriticalJunctions(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCriticalJunctions(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.layers, visibleLayers.critical_junctions]);

  const rasterLayers = job.layers.filter((layer) => layer.kind === "raster");
  const vectorLayers = job.layers.filter((layer) => layer.kind === "vector");
  const focusBounds =
    job.layers.find((layer) => layer.name === "sentinel")?.bounds ??
    job.bounds ??
    undefined;

  return (
    <div className="map-shell">
      <div className="card map-panel">
        <div className="page-header" style={{ marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Layer Controls</h2>
            <p>
              OSM stays fixed at the base. Sentinel RGB and all generated masks can be toggled
              independently on top.
            </p>
          </div>
        </div>

        <div className="layer-list">
          {rasterLayers.map((layer) => (
            <label className="layer-toggle" key={layer.name}>
              <div className="layer-meta">
                <span
                  className="swatch"
                  style={{
                    background: layer.legend_color ?? "linear-gradient(135deg, #b8763e, #f0c419)",
                  }}
                />
                <div>
                  <strong>{layer.label}</strong>
                  <div className="helper">Opacity {Math.round(layer.opacity * 100)}%</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(visibleLayers[layer.name])}
                onChange={(event) =>
                  setVisibleLayers((current) => ({
                    ...current,
                    [layer.name]: event.target.checked,
                  }))
                }
              />
            </label>
          ))}

          {vectorLayers.map((layer) => (
            <label className="layer-toggle" key={layer.name}>
              <div className="layer-meta">
                <span className="swatch" style={{ background: layer.legend_color ?? "#c95a27" }} />
                <div>
                  <strong>{layer.label}</strong>
                  <div className="helper">GeoJSON overlay</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(visibleLayers[layer.name])}
                onChange={(event) =>
                  setVisibleLayers((current) => ({
                    ...current,
                    [layer.name]: event.target.checked,
                  }))
                }
              />
            </label>
          ))}
        </div>

        <div className="map-note">
          <strong>{job.project_name}</strong>
          <div className="helper">
            Segmenter: {job.segmenter} | Classifier: {job.classifier}
          </div>
          <div className="helper">Job stage: {job.stage}</div>
        </div>
      </div>

      <div className="map-frame">
        <MapContainer center={[24.8607, 67.0011]} zoom={11} scrollWheelZoom>
          <BoundsController bounds={focusBounds} />
          <TileLayer
            attribution={BASEMAP_ATTRIBUTION}
            url={BASEMAP_TILE_URL}
          />

          {rasterLayers.map((layer) =>
            visibleLayers[layer.name] && layer.tiles_url ? (
              <TileLayer
                key={layer.name}
                url={layer.tiles_url}
                opacity={layer.opacity}
                attribution="Roadlytics"
              />
            ) : null,
          )}

          {visibleLayers.critical_junctions && criticalJunctions ? (
            <GeoJSON
              data={criticalJunctions}
              pointToLayer={(_, latlng) =>
                circleMarker(latlng, {
                  radius: 6,
                  color: "#8d320f",
                  weight: 2,
                  fillColor: "#f0a25d",
                  fillOpacity: 0.85,
                })
              }
            />
          ) : null}
        </MapContainer>
      </div>
    </div>
  );
}
