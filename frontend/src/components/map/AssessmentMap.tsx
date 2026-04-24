/** Leaflet map with region overlays and raster TIF condition layer rendering. */
import { useEffect, useState } from "react";
import {
  CircleMarker,
  ImageOverlay,
  MapContainer,
  Polygon as LeafletPolygon,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Polygon } from "geojson";

import { LayersPanel } from "@/components/map-analysis/LayersPanel";
import { RoadMetadataPanel } from "@/components/map-analysis/RoadMetadataPanel";
import { MapAnalysisController } from "@/controllers/MapAnalysisController";
import type { MapToolAction } from "@/models/MapTool";
import type { JobDownloads, Region } from "@/types";

export type ExternalLayerState = {
  showSatellite?: boolean;
  showSegMask?: boolean;
  showCombined?: boolean;
  showGood?: boolean;
  showDamaged?: boolean;
  showUnpaved?: boolean;
  showConnMap?: boolean;
  segMaskOpacity?: number;
  combinedOpacity?: number;
  goodOpacity?: number;
  damagedOpacity?: number;
  unpavedOpacity?: number;
  connMapOpacity?: number;
};

type AssessmentMapProps = {
  regions: Region[];
  guestMode: boolean;
  selectedRegionId?: string;
  results?: unknown;
  downloads?: JobDownloads;
  isFullscreen?: boolean;
  onDrawnRegionChange?: (polygon: Polygon | null) => void;
  initialActiveTool?: MapToolAction | null;
  drawRegionReadyHint?: string;
  externalLayers?: ExternalLayerState;
};

type DrawPoint = [number, number];

// ── Colormaps ──────────────────────────────────────────────────────────────────

const combinedColormap = (value: number): [number, number, number, number] => {
  switch (value) {
    case 1: return [46, 204, 113, 180];   // Good — green
    case 2: return [231, 76, 60, 180];    // Damaged — red
    case 3: return [149, 165, 166, 180];  // Unpaved — grey
    default: return [0, 0, 0, 0];
  }
};

const segColormap = (_value: number): [number, number, number, number] =>
  [56, 189, 248, 160]; // Road pixel — sky blue

const componentColormap = (value: number): [number, number, number, number] =>
  value > 0 ? [255, Math.round(100 + (value * 37) % 155), 50, 160] : [0, 0, 0, 0];

// ── TIF overlay component ─────────────────────────────────────────────────────

type TifOverlayProps = {
  url: string;
  bounds: LatLngBoundsExpression;
  colormap: (value: number) => [number, number, number, number];
  opacity?: number;
};

const TifOverlayLayer = ({ url, bounds, colormap, opacity = 1 }: TifOverlayProps): JSX.Element | null => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    void (async () => {
      try {
        const { fromArrayBuffer } = await import("geotiff");
        const response = await fetch(url);
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        const tiff = await fromArrayBuffer(buffer);
        const image = await tiff.getImage();
        const [band] = await image.readRasters() as [Uint8Array | Float32Array | Int16Array];
        const width = image.getWidth();
        const height = image.getHeight();

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imgData = ctx.createImageData(width, height);
        for (let i = 0; i < band.length; i++) {
          const [r, g, b, a] = colormap(band[i]);
          imgData.data[i * 4]     = r;
          imgData.data[i * 4 + 1] = g;
          imgData.data[i * 4 + 2] = b;
          imgData.data[i * 4 + 3] = a;
        }
        ctx.putImageData(imgData, 0, 0);
        if (!cancelled) setDataUrl(canvas.toDataURL("image/png"));
      } catch (err) {
        console.warn("[TifOverlayLayer] failed to load TIF:", url, err);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  if (!dataUrl) return null;
  return <ImageOverlay url={dataUrl} bounds={bounds} opacity={opacity} />;
};

// ── Region bounds helper ───────────────────────────────────────────────────────

const regionBounds = (region: Region | null): LatLngBoundsExpression | null => {
  if (!region) return null;
  const ring = region.polygon.coordinates[0];
  const lats = ring.map(([, lat]) => lat);
  const lngs = ring.map(([lng]) => lng);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
};

// ── Tile sources ───────────────────────────────────────────────────────────────

const satelliteTiles = {
  attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};
const satelliteReferenceTiles = {
  attribution: "Labels &copy; Esri",
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
};
const openStreetMapTiles = {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

// ── Utility helpers ────────────────────────────────────────────────────────────

const toDrawnRegionPolygon = (points: DrawPoint[]): Polygon | null => {
  if (points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat]);
  return { type: "Polygon", coordinates: [[...ring, ring[0]]] };
};

const invalidateMapSize = (map: ReturnType<typeof useMap>): void => {
  map.invalidateSize({ pan: false, debounceMoveend: true });
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const MapSizeInvalidator = (): null => {
  const map = useMap();
  useEffect(() => {
    let raf = 0;
    const schedule = (): void => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => invalidateMapSize(map));
    };
    schedule();
    const tid = window.setTimeout(() => invalidateMapSize(map), 180);
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(schedule)
      : null;
    ro?.observe(map.getContainer());
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(tid);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
    };
  }, [map]);
  return null;
};

const DrawRegionInteraction = ({
  isActive,
  onPointAdd,
}: { isActive: boolean; onPointAdd: (point: DrawPoint) => void }): null => {
  const map = useMapEvents({
    click(e) {
      if (isActive) onPointAdd([e.latlng.lat, e.latlng.lng]);
    },
  });
  useEffect(() => {
    const c = map.getContainer();
    const prev = c.style.cursor;
    c.style.cursor = isActive ? "crosshair" : "";
    return () => { c.style.cursor = prev; };
  }, [isActive, map]);
  return null;
};

// ── Main component ─────────────────────────────────────────────────────────────

export const AssessmentMap = ({
  regions,
  guestMode: _guestMode,
  selectedRegionId = "",
  results: _results = null,
  downloads,
  isFullscreen = false,
  onDrawnRegionChange,
  initialActiveTool = null,
  drawRegionReadyHint = "Region ready with {count} points. Click Finish Region, then save it below the map.",
  externalLayers,
}: AssessmentMapProps): JSX.Element => {
  const [controller] = useState<MapAnalysisController>(() => {
    const c = new MapAnalysisController();
    c.setActiveTool(initialActiveTool);
    return c;
  });
  const [, setControllerVersion] = useState(0);
  const [draftRegionPoints, setDraftRegionPoints] = useState<DrawPoint[]>([]);
  const [drawnRegionPoints, setDrawnRegionPoints] = useState<DrawPoint[] | null>(null);

  const selectedRegions = selectedRegionId
    ? regions.filter((r) => r.id === selectedRegionId)
    : [];
  const selectedRegion = selectedRegions[0] ?? null;
  const bounds = regionBounds(selectedRegion);

  const layerVisibility = new Map(controller.getLayers().map((l) => [l.id, l.isVisible]));
  const ext = externalLayers;
  const showSatellite   = ext?.showSatellite  ?? layerVisibility.get("satellite")    ?? true;
  const showSegMask     = ext?.showSegMask     ?? layerVisibility.get("segmentation") ?? true;
  const showCombined    = ext?.showCombined    ?? layerVisibility.get("combined")     ?? true;
  const showGood        = ext?.showGood        ?? layerVisibility.get("good")         ?? false;
  const showDamaged     = ext?.showDamaged     ?? layerVisibility.get("damaged")      ?? false;
  const showUnpaved     = ext?.showUnpaved     ?? layerVisibility.get("unpaved")      ?? false;
  const showConnMap     = ext?.showConnMap     ?? layerVisibility.get("connectivity") ?? false;
  const segMaskOpacity  = ext?.segMaskOpacity  ?? 1;
  const combinedOpacity = ext?.combinedOpacity ?? 1;
  const goodOpacity     = ext?.goodOpacity     ?? 1;
  const damagedOpacity  = ext?.damagedOpacity  ?? 1;
  const unpavedOpacity  = ext?.unpavedOpacity  ?? 1;
  const connMapOpacity  = ext?.connMapOpacity  ?? 1;
  const goodColormap    = (_v: number): [number, number, number, number] => [46, 204, 113, 180];
  const damagedColormap = (_v: number): [number, number, number, number] => [231, 76, 60, 180];
  const unpavedColormap = (_v: number): [number, number, number, number] => [149, 165, 166, 180];

  const activeTool      = controller.getActiveTool();
  const isDrawingRegion = activeTool === "draw-region";
  const hasDrawRegion   = draftRegionPoints.length > 0 || drawnRegionPoints !== null;

  const handleAddDrawPoint = (point: DrawPoint): void => {
    if (draftRegionPoints.length === 0 && drawnRegionPoints !== null) {
      setDrawnRegionPoints(null);
      onDrawnRegionChange?.(null);
    }
    setDraftRegionPoints((prev) => [...prev, point]);
  };

  const handleCompleteDrawRegion = (): void => {
    const polygon = toDrawnRegionPolygon(draftRegionPoints);
    if (!polygon) return;
    setDrawnRegionPoints(draftRegionPoints);
    setDraftRegionPoints([]);
    onDrawnRegionChange?.(polygon);
    controller.setActiveTool(null);
    setControllerVersion((v) => v + 1);
  };

  const handleClearDrawRegion = (): void => {
    setDraftRegionPoints([]);
    setDrawnRegionPoints(null);
    onDrawnRegionChange?.(null);
  };

  const drawRegionHint = draftRegionPoints.length === 0
    ? "Click points on the map to start outlining a region."
    : draftRegionPoints.length < 3
      ? `Add at least ${3 - draftRegionPoints.length} more point${3 - draftRegionPoints.length === 1 ? "" : "s"} to complete the region.`
      : drawRegionReadyHint.replace("{count}", draftRegionPoints.length.toString());

  const containerClass = isFullscreen
    ? "absolute inset-0 z-0 overflow-hidden"
    : "relative h-[clamp(540px,80vh,960px)] overflow-hidden rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]";

  return (
    <div className={containerClass}>
      {!externalLayers && (
        <LayersPanel
          controller={controller}
          drawRegionHint={drawRegionHint}
          canCompleteDrawRegion={draftRegionPoints.length >= 3}
          hasDrawRegion={hasDrawRegion}
          onCompleteDrawRegion={handleCompleteDrawRegion}
          onClearDrawRegion={handleClearDrawRegion}
          onControllerChange={() => setControllerVersion((v) => v + 1)}
        />
      )}
      {!externalLayers && (
        <RoadMetadataPanel
          metadata={null}
          emptyMessage="Road metadata will appear here when classification results are available."
        />
      )}

      <MapContainer
        center={[25.8943, 68.5247]}
        zoom={7}
        className="h-full w-full"
        scrollWheelZoom
        zoomControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <MapSizeInvalidator />
        <DrawRegionInteraction isActive={isDrawingRegion} onPointAdd={handleAddDrawPoint} />
        <ZoomControl position="topright" />

        {/* Base tile layer */}
        <TileLayer
          attribution={showSatellite ? satelliteTiles.attribution : openStreetMapTiles.attribution}
          url={showSatellite ? satelliteTiles.url : openStreetMapTiles.url}
        />
        {showSatellite ? (
          <TileLayer
            attribution={satelliteReferenceTiles.attribution}
            url={satelliteReferenceTiles.url}
            pane="overlayPane"
          />
        ) : null}

        {/* TIF overlay layers — rendered only when downloads are present and bounds are known */}
        {bounds && downloads?.seg_mask_tif && showSegMask ? (
          <TifOverlayLayer url={downloads.seg_mask_tif} bounds={bounds} colormap={segColormap} opacity={segMaskOpacity} />
        ) : null}
        {bounds && downloads?.combined_tif && showCombined ? (
          <TifOverlayLayer url={downloads.combined_tif} bounds={bounds} colormap={combinedColormap} opacity={combinedOpacity} />
        ) : null}
        {bounds && downloads?.good_tif && showGood ? (
          <TifOverlayLayer url={downloads.good_tif} bounds={bounds} colormap={goodColormap} opacity={goodOpacity} />
        ) : null}
        {bounds && downloads?.damaged_tif && showDamaged ? (
          <TifOverlayLayer url={downloads.damaged_tif} bounds={bounds} colormap={damagedColormap} opacity={damagedOpacity} />
        ) : null}
        {bounds && downloads?.unpaved_tif && showUnpaved ? (
          <TifOverlayLayer url={downloads.unpaved_tif} bounds={bounds} colormap={unpavedColormap} opacity={unpavedOpacity} />
        ) : null}
        {bounds && downloads?.component_map_tif && showConnMap ? (
          <TifOverlayLayer url={downloads.component_map_tif} bounds={bounds} colormap={componentColormap} opacity={connMapOpacity} />
        ) : null}

        {/* Region boundary outline for selected region */}
        {selectedRegions.length > 0 ? (
          <LeafletPolygon
            positions={selectedRegions[0].polygon.coordinates[0].map(
              ([lng, lat]) => [lat, lng] as [number, number],
            )}
            pathOptions={{ color: "#38bdf8", weight: 2, fillOpacity: 0.06 }}
          />
        ) : null}

        {/* In-progress drawn region */}
        {drawnRegionPoints && drawnRegionPoints.length >= 3 ? (
          <LeafletPolygon
            positions={drawnRegionPoints}
            pathOptions={{ color: "#f8fafc", weight: 3, fillColor: "#2ea043", fillOpacity: 0.18 }}
          />
        ) : null}
        {draftRegionPoints.length >= 2 ? (
          <Polyline
            positions={draftRegionPoints}
            pathOptions={{ color: "#f8fafc", weight: 3, dashArray: "6 8" }}
          />
        ) : null}
        {draftRegionPoints.length >= 3 ? (
          <LeafletPolygon
            positions={draftRegionPoints}
            pathOptions={{ color: "#f8fafc", weight: 2, dashArray: "6 8", fillColor: "#2ea043", fillOpacity: 0.12 }}
          />
        ) : null}
        {draftRegionPoints.map((point, index) => (
          <CircleMarker
            key={`${point[0]}-${point[1]}-${index}`}
            center={point}
            radius={6}
            pathOptions={{ color: "#f8fafc", weight: 2, fillColor: "#2ea043", fillOpacity: 1 }}
          />
        ))}
      </MapContainer>
    </div>
  );
};
