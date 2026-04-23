import type {
  Feature,
  FeatureCollection,
  GeoJsonObject,
  GeoJsonProperties,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isGeometry = (value: unknown): value is Geometry => {
  return isRecord(value) && typeof value.type === "string";
};

const isFeature = (value: unknown): value is Feature => {
  return isRecord(value) && value.type === "Feature" && "geometry" in value;
};

const isFeatureCollection = (value: unknown): value is FeatureCollection => {
  return isRecord(value) && value.type === "FeatureCollection" && Array.isArray(value.features);
};

const multiPolygonToPolygon = (geometry: MultiPolygon): Polygon => {
  const firstPolygon = geometry.coordinates[0];
  if (!Array.isArray(firstPolygon) || firstPolygon.length === 0) {
    throw new Error("The GeoJSON MultiPolygon does not contain any polygon coordinates.");
  }

  return {
    type: "Polygon",
    coordinates: firstPolygon,
  };
};

const toPolygon = (geometry: Geometry): Polygon | null => {
  if (geometry.type === "Polygon") {
    return geometry;
  }

  if (geometry.type === "MultiPolygon") {
    return multiPolygonToPolygon(geometry);
  }

  return null;
};

export const extractPolygonFromGeoJSON = (value: unknown): Polygon => {
  if (isFeatureCollection(value)) {
    for (const feature of value.features) {
      if (!feature || !isGeometry(feature.geometry)) {
        continue;
      }

      const polygon = toPolygon(feature.geometry);
      if (polygon) {
        return polygon;
      }
    }

    throw new Error("The GeoJSON file does not contain a Polygon or MultiPolygon feature.");
  }

  if (isFeature(value)) {
    if (!isGeometry(value.geometry)) {
      throw new Error("The GeoJSON feature does not contain a valid geometry.");
    }

    const polygon = toPolygon(value.geometry);
    if (polygon) {
      return polygon;
    }

    throw new Error("The uploaded GeoJSON feature is not a Polygon or MultiPolygon.");
  }

  if (isGeometry(value)) {
    const polygon = toPolygon(value);
    if (polygon) {
      return polygon;
    }
  }

  throw new Error("Upload a valid GeoJSON Polygon or MultiPolygon file.");
};

export const readPolygonFromGeoJSONFile = async (file: File): Promise<Polygon> => {
  const text = await file.text();
  let parsed: GeoJsonObject | unknown;

  try {
    parsed = JSON.parse(text) as GeoJsonObject;
  } catch {
    throw new Error("The uploaded file is not valid JSON.");
  }

  return extractPolygonFromGeoJSON(parsed);
};

type MapFeatureCollection = FeatureCollection<Geometry>;

const parseGeoJSONLikeValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as GeoJsonObject;
  } catch {
    return null;
  }
};

const mergeFeatureProperties = (
  current: GeoJsonProperties | null | undefined,
  next: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    ...(isRecord(current) ? current : {}),
    ...next,
  };
};

const toMapFeature = (
  feature: Feature,
  extraProperties: Record<string, unknown>,
): Feature<Geometry> | null => {
  if (!isGeometry(feature.geometry)) {
    return null;
  }

  return {
    ...feature,
    geometry: feature.geometry,
    properties: mergeFeatureProperties(feature.properties, extraProperties),
  };
};

export const normalizeGeoJSONForMap = (
  value: unknown,
  extraProperties: Record<string, unknown> = {},
): MapFeatureCollection | null => {
  const parsed = parseGeoJSONLikeValue(value);
  if (!parsed) {
    return null;
  }

  if (isFeatureCollection(parsed)) {
    const features = parsed.features
      .map((feature) => {
        if (!feature) {
          return null;
        }

        return toMapFeature(feature, extraProperties);
      })
      .filter((feature): feature is Feature<Geometry> => feature !== null);

    if (features.length === 0) {
      return null;
    }

    return {
      type: "FeatureCollection",
      features,
    };
  }

  if (isFeature(parsed)) {
    const feature = toMapFeature(parsed, extraProperties);
    if (!feature) {
      return null;
    }

    return {
      type: "FeatureCollection",
      features: [feature],
    };
  }

  if (isGeometry(parsed)) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: parsed,
          properties: extraProperties,
        },
      ],
    };
  }

  return null;
};
