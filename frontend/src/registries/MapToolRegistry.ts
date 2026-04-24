import { Calendar, Spline, Upload } from "lucide-react";

import { MapTool } from "@/models/MapTool";

export class MapToolRegistry {
  private static readonly tools: MapTool[] = [
    new MapTool("draw", "Draw Region", Spline, "draw-region"),
    new MapTool("upload", "Upload GeoTIFF", Upload, "upload-geotiff"),
    new MapTool("date", "Select Date", Calendar, "select-date"),
  ];

  public static getAll(): MapTool[] {
    return [...MapToolRegistry.tools];
  }

  public static getById(id: string): MapTool | undefined {
    return MapToolRegistry.tools.find((tool) => tool.id === id);
  }
}
