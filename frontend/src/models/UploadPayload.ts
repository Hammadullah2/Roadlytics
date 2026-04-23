import type { Polygon } from "geojson";

import { UploadMethod } from "@/models/UploadMethod";

export interface UploadPayload {
  method: UploadMethod;
  region?: string;
  regionPolygon?: Polygon;
  startDate?: string;
  endDate?: string;
}
