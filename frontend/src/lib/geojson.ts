import type { Polygon, MultiPolygon, Feature, GeoJsonObject } from "geojson";

export async function readPolygonFromGeoJSONFile(file: File): Promise<Polygon> {
  const text = await file.text();
  const data = JSON.parse(text) as GeoJsonObject;

  if (data.type === "Polygon") return data as Polygon;

  if (data.type === "MultiPolygon") {
    return { type: "Polygon", coordinates: (data as MultiPolygon).coordinates[0] };
  }

  if (data.type === "Feature") {
    const f = data as Feature;
    if (f.geometry?.type === "Polygon") return f.geometry as Polygon;
    if (f.geometry?.type === "MultiPolygon")
      return { type: "Polygon", coordinates: (f.geometry as MultiPolygon).coordinates[0] };
  }

  if (data.type === "FeatureCollection") {
    for (const f of (data as unknown as { features: Feature[] }).features) {
      if (f.geometry?.type === "Polygon") return f.geometry as Polygon;
      if (f.geometry?.type === "MultiPolygon")
        return { type: "Polygon", coordinates: (f.geometry as MultiPolygon).coordinates[0] };
    }
  }

  throw new Error("No Polygon or MultiPolygon geometry found in the uploaded file.");
}
