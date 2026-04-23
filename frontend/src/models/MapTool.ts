import type { LucideIcon } from "lucide-react";

export type MapToolAction = "draw-region" | "upload-geotiff" | "select-date";

export class MapTool {
  public readonly id: string;
  public readonly label: string;
  public readonly icon: LucideIcon;
  public readonly action: MapToolAction;

  public constructor(
    id: string,
    label: string,
    icon: LucideIcon,
    action: MapToolAction,
  ) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.action = action;
  }
}
