/** This component renders the shared Leaflet map with region and analysis overlays. */
import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polygon as LeafletPolygon, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import type { Feature, FeatureCollection, GeoJsonObject, GeoJsonProperties, Geometry, Polygon } from "geojson";
import type { RoadFeatureProperties } from "@/types";

import { LayersPanel } from "@/components/map-analysis/LayersPanel";
import { RoadMetadataPanel } from "@/components/map-analysis/RoadMetadataPanel";
import { MapAnalysisController } from "@/controllers/MapAnalysisController";
import { normalizeGeoJSONForMap } from "@/lib/geojson";
import type { MapToolAction } from "@/models/MapTool";
import { RoadCondition, RoadMetadata, SurfaceType } from "@/models/RoadMetadata";
import type { BackendClassificationResult, BackendJobResults, RoadLabel, Region } from "@/types";

type AssessmentMapProps = {
  regions: Region[];
  guestMode: boolean;
  selectedRegionId?: string;
  results?: BackendJobResults | null;
  roadsGeoJSON?: FeatureCollection | null;
  satelliteTileUrl?: string;
  isFullscreen?: boolean;
  onDrawnRegionChange?: (polygon: Polygon | null) => void;
  initialActiveTool?: MapToolAction | null;
  drawRegionReadyHint?: string;
};

type MapFeatureCollection = FeatureCollection<Geometry>;
type DrawPoint = [number, number];
type ClassificationFeatureProperties = GeoJsonProperties & {
  id?: string;
  patch_id?: string;
  road_label?: RoadLabel;
  created_at?: string;
};

const toFeatureCollection = (regions: Region[]): FeatureCollection<Polygon> => {
  return {
    type: "FeatureCollection",
    features: regions.map<Feature<Polygon>>((region) => ({
      type: "Feature",
      geometry: region.polygon,
      properties: {
        id: region.id,
        name: region.name,
      },
    })),
  };
};

const combineFeatureCollections = (collections: Array<MapFeatureCollection | null>): MapFeatureCollection | null => {
  const features = collections.flatMap((collection) => collection?.features ?? []);
  if (features.length === 0) {
    return null;
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

const toClassificationCollection = (
  classificationResults: BackendClassificationResult[],
): MapFeatureCollection | null => {
  return combineFeatureCollections(
    classificationResults.map((result) => {
      return normalizeGeoJSONForMap(result.geometry ?? result.bbox, {
        id: result.id,
        patch_id: result.patch_id,
        road_label: result.road_label,
        confidence: result.confidence,
        created_at: result.created_at,
      });
    }),
  );
};

const conditionColor = (label: string): string => {
  switch (label) {
    case "Good":
      return "#2ecc71";
    case "Damaged":
      return "#e74c3c";
    case "Unpaved":
      return "#95a5a6";
    default:
      return "#38bdf8";
  }
};

const satelliteTiles = {
  attribution:
    "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
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

const formatRoadIdentifier = (id: string, patchID?: string): string => {
  const candidate = (patchID ?? id).trim();
  if (!candidate) {
    return "Unknown";
  }

  return candidate.length > 12 ? candidate.slice(0, 12) : candidate;
};

const formatLastUpdated = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "Unavailable";
  }

  const date = new Date(trimmedValue);
  if (Number.isNaN(date.getTime())) {
    return trimmedValue;
  }

  return date.toISOString().slice(0, 10);
};

const toDrawnRegionPolygon = (points: DrawPoint[]): Polygon | null => {
  if (points.length < 3) {
    return null;
  }

  const ring = points.map(([latitude, longitude]) => [longitude, latitude]);
  const [firstLongitude, firstLatitude] = ring[0];

  return {
    type: "Polygon",
    coordinates: [[...ring, [firstLongitude, firstLatitude]]],
  };
};

const toRoadCondition = (label: string): RoadCondition => {
  switch (label) {
    case "Good":
      return RoadCondition.GOOD;
    case "Damaged":
      return RoadCondition.DAMAGED;
    case "Unpaved":
      return RoadCondition.UNKNOWN;
    default:
      return RoadCondition.UNKNOWN;
  }
};

const toSurfaceType = (label: string): SurfaceType => {
  switch (label) {
    case "Good":
    case "Damaged":
      return SurfaceType.PAVED;
    case "Unpaved":
      return SurfaceType.UNPAVED;
    default:
      return SurfaceType.UNKNOWN;
  }
};

const toRoadMetadata = (
  payload: Pick<BackendClassificationResult, "id" | "patch_id" | "road_label" | "created_at">,
): RoadMetadata => {
  return new RoadMetadata(
    formatRoadIdentifier(payload.id, payload.patch_id),
    toRoadCondition(payload.road_label),
    toSurfaceType(payload.road_label),
    formatLastUpdated(payload.created_at),
  );
};

const roadMetadataFromProperties = (properties: GeoJsonProperties | null | undefined): RoadMetadata | null => {
  const typedProperties = properties as ClassificationFeatureProperties | null | undefined;
  if (!typedProperties || typeof typedProperties.id !== "string" || typeof typedProperties.road_label !== "string") {
    return null;
  }

  return new RoadMetadata(
    formatRoadIdentifier(typedProperties.id, typedProperties.patch_id),
    toRoadCondition(typedProperties.road_label),
    toSurfaceType(typedProperties.road_label),
    formatLastUpdated(typeof typedProperties.created_at === "string" ? typedProperties.created_at : ""),
  );
};

const invalidateMapSize = (map: ReturnType<typeof useMap>): void => {
  map.invalidateSize({
    pan: false,
    debounceMoveend: true,
  });
};

const MapSizeInvalidator = (): null => {
  const map = useMap();

  useEffect(() => {
    let animationFrameId = 0;
    let timeoutId = 0;

    const scheduleInvalidation = (): void => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        invalidateMapSize(map);
      });
    };

    scheduleInvalidation();
    timeoutId = window.setTimeout(() => {
      invalidateMapSize(map);
    }, 180);

    const container = map.getContainer();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
        scheduleInvalidation();
      });

    resizeObserver?.observe(container);
    window.addEventListener("resize", scheduleInvalidation);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleInvalidation);
      resizeObserver?.disconnect();
    };
  }, [map]);

  return null;
};

type DrawRegionInteractionProps = {
  isActive: boolean;
  onPointAdd: (point: DrawPoint) => void;
};

const DrawRegionInteraction = ({
  isActive,
  onPointAdd,
}: DrawRegionInteractionProps): null => {
  const map = useMapEvents({
    click(event) {
      if (!isActive) {
        return;
      }

      onPointAdd([event.latlng.lat, event.latlng.lng]);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    const previousCursor = container.style.cursor;
    container.style.cursor = isActive ? "crosshair" : "";

    return () => {
      container.style.cursor = previousCursor;
    };
  }, [isActive, map]);

  return null;
};

export const AssessmentMap = ({
  regions,
  guestMode,
  selectedRegionId = "",
  results = null,
  roadsGeoJSON: roadsGeoJSONProp = null,
  satelliteTileUrl,
  isFullscreen = false,
  onDrawnRegionChange,
  initialActiveTool = null,
  drawRegionReadyHint = "Region ready with {count} points. Click Finish Region, then save it below the map.",
}: AssessmentMapProps): JSX.Element => {
  const [controller] = useState<MapAnalysisController>(() => {
    const nextController = new MapAnalysisController();
    nextController.setActiveTool(initialActiveTool);
    return nextController;
  });
  const [, setControllerVersion] = useState<number>(0);
  const [selectedMetadata, setSelectedMetadata] = useState<RoadMetadata | null>(null);
  const [draftRegionPoints, setDraftRegionPoints] = useState<DrawPoint[]>([]);
  const [drawnRegionPoints, setDrawnRegionPoints] = useState<DrawPoint[] | null>(null);
  const roadsGeoJSON = roadsGeoJSONProp;

  const selectedRegions = selectedRegionId
    ? regions.filter((region) => region.id === selectedRegionId)
    : [];
  const selectedRegionLayer = selectedRegions.length > 0 ? toFeatureCollection(selectedRegions) : null;
  const segmentationLayer = normalizeGeoJSONForMap(results?.segmentation?.geojson_data ?? null, {
    layer: "segmentation",
  });
  const classificationLayer = toClassificationCollection(results?.classification ?? []);
  const connectivityLayer = normalizeGeoJSONForMap(results?.connectivity?.graph_data ?? null, {
    layer: "connectivity",
  });
  const layerVisibility = new Map(controller.getLayers().map((layer) => [layer.id, layer.isVisible]));
  const showSatellite = layerVisibility.get("satellite") ?? true;
  const showRoadSegmentation = layerVisibility.get("road-segmentation") ?? true;
  const showConnectivity = layerVisibility.get("connectivity") ?? false;
  const defaultClassification = results?.classification[0] ?? null;
  const activeTool = controller.getActiveTool();
  const isDrawingRegion = activeTool === "draw-region";
  const hasDrawRegion = draftRegionPoints.length > 0 || drawnRegionPoints !== null;

  const handleAddDrawPoint = (point: DrawPoint): void => {
    if (draftRegionPoints.length === 0 && drawnRegionPoints !== null) {
      setDrawnRegionPoints(null);
      onDrawnRegionChange?.(null);
    }

    setDraftRegionPoints((currentPoints) => [...currentPoints, point]);
  };

  const handleCompleteDrawRegion = (): void => {
    const polygon = toDrawnRegionPolygon(draftRegionPoints);
    if (!polygon) {
      return;
    }

    setDrawnRegionPoints(draftRegionPoints);
    setDraftRegionPoints([]);
    onDrawnRegionChange?.(polygon);
    controller.setActiveTool(null);
    setControllerVersion((currentValue) => currentValue + 1);
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

  useEffect(() => {
    setSelectedMetadata(defaultClassification ? toRoadMetadata(defaultClassification) : null);
  }, [
    defaultClassification?.created_at,
    defaultClassification?.id,
    defaultClassification?.patch_id,
    defaultClassification?.road_label,
    results?.job_id,
  ]);

  const containerClass = isFullscreen
    ? "fixed inset-0 z-0 overflow-hidden bg-[color:var(--bg-secondary)]"
    : "relative h-[clamp(540px,80vh,960px)] overflow-hidden rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]";

  return (
    <div className={containerClass}>
      <LayersPanel
        controller={controller}
        drawRegionHint={drawRegionHint}
        canCompleteDrawRegion={draftRegionPoints.length >= 3}
        hasDrawRegion={hasDrawRegion}
        onCompleteDrawRegion={handleCompleteDrawRegion}
        onClearDrawRegion={handleClearDrawRegion}
        onControllerChange={() => {
          setControllerVersion((currentValue) => currentValue + 1);
        }}
      />
      <RoadMetadataPanel
        metadata={selectedMetadata}
        emptyMessage={
          results?.classification.length
            ? "Click a highlighted road segment to inspect its details."
            : "Road metadata will appear here when classification results are available."
        }
      />

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
        {satelliteTileUrl ? (
          <TileLayer
            attribution='Imagery &copy; <a href="https://www.planet.com/">Planet</a> / ESA Sentinel-2'
            url={satelliteTileUrl}
            pane="overlayPane"
            opacity={0.85}
          />
        ) : null}

        {!guestMode && regions.length > 0 ? (
          <GeoJSON
            data={toFeatureCollection(regions) as GeoJsonObject}
            style={() => ({
              color: "#2ea043",
              weight: 2,
              fillColor: "#2ea043",
              fillOpacity: 0.08,
            })}
          />
        ) : null}

        {!guestMode && selectedRegionLayer ? (
          <GeoJSON
            data={selectedRegionLayer as GeoJsonObject}
            style={() => ({
              color: "#3fb950",
              weight: 3,
              fillColor: "#3fb950",
              fillOpacity: 0.14,
            })}
          />
        ) : null}

        {showRoadSegmentation && segmentationLayer ? (
          <GeoJSON
            data={segmentationLayer as GeoJsonObject}
            style={() => ({
              color: "#38bdf8",
              weight: 2,
              fillColor: "#38bdf8",
              fillOpacity: 0.2,
            })}
          />
        ) : null}

        {showRoadSegmentation && classificationLayer ? (
          <GeoJSON
            data={classificationLayer as GeoJsonObject}
            style={(feature) => {
              const roadLabel = typeof feature?.properties?.road_label === "string"
                ? feature.properties.road_label
                : "";
              const color = conditionColor(roadLabel);

              return {
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.34,
              };
            }}
            onEachFeature={(feature, layer) => {
              layer.on("click", () => {
                const metadata = roadMetadataFromProperties(feature.properties);
                if (!metadata) {
                  return;
                }

                setSelectedMetadata(metadata);
              });
            }}
          />
        ) : null}

        {roadsGeoJSON ? (
          <GeoJSON
            data={roadsGeoJSON as GeoJsonObject}
            style={(feature) => {
              const props = feature?.properties as RoadFeatureProperties | null;
              const color = conditionColor(props?.condition ?? "");
              const weight = 2 + (props?.confidence ?? 0) * 4;
              const opacity = props?.review ? 0.5 : 0.9;
              return { color, weight, opacity, fillOpacity: 0 };
            }}
            onEachFeature={(feature, layer) => {
              layer.on("click", () => {
                const props = feature.properties as RoadFeatureProperties | null;
                if (!props) {
                  return;
                }

                setSelectedMetadata(new RoadMetadata(
                  String(props.road_id ?? ""),
                  toRoadCondition(props.condition),
                  toSurfaceType(props.condition),
                  "",
                ));
              });
            }}
          />
        ) : null}

        {showConnectivity && connectivityLayer ? (
          <GeoJSON
            data={connectivityLayer as GeoJsonObject}
            style={() => ({
              color: "#a78bfa",
              weight: 3,
              fillColor: "#a78bfa",
              fillOpacity: 0.08,
            })}
          />
        ) : null}

        {drawnRegionPoints && drawnRegionPoints.length >= 3 ? (
          <LeafletPolygon
            positions={drawnRegionPoints}
            pathOptions={{
              color: "#f8fafc",
              weight: 3,
              fillColor: "#2ea043",
              fillOpacity: 0.18,
            }}
          />
        ) : null}

        {draftRegionPoints.length >= 2 ? (
          <Polyline
            positions={draftRegionPoints}
            pathOptions={{
              color: "#f8fafc",
              weight: 3,
              dashArray: "6 8",
            }}
          />
        ) : null}

        {draftRegionPoints.length >= 3 ? (
          <LeafletPolygon
            positions={draftRegionPoints}
            pathOptions={{
              color: "#f8fafc",
              weight: 2,
              dashArray: "6 8",
              fillColor: "#2ea043",
              fillOpacity: 0.12,
            }}
          />
        ) : null}

        {draftRegionPoints.map((point, index) => (
          <CircleMarker
            key={`${point[0]}-${point[1]}-${index}`}
            center={point}
            radius={6}
            pathOptions={{
              color: "#f8fafc",
              weight: 2,
              fillColor: "#2ea043",
              fillOpacity: 1,
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
};
