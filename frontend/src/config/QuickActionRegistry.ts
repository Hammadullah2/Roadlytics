import { MapPin, ScanLine, Upload } from "lucide-react";

import { QuickAction } from "@/models/QuickAction";

export class QuickActionRegistry {
  private static readonly actions: QuickAction[] = [
    new QuickAction("upload-satellite-imagery", "Upload Satellite Imagery", Upload, "primary", "/upload"),
    new QuickAction("select-region-on-map", "Select Region on Map", MapPin, "secondary", "/map-analysis"),
    new QuickAction("run-segmentation", "Run Segmentation", ScanLine, "secondary", "/processing"),
  ];

  public static getAll(): QuickAction[] {
    return [...QuickActionRegistry.actions];
  }
}
