import type { LucideIcon } from "lucide-react";

export type AdminActionType =
  | "system-settings"
  | "manage-users"
  | "database-backup"
  | "view-logs"
  | "export-data"
  | "performance-metrics";

export class AdminQuickAction {
  public readonly id: string;
  public readonly label: string;
  public readonly icon: LucideIcon;
  public readonly bgColor: string;
  public readonly hoverColor: string;
  public readonly action: AdminActionType;

  public constructor(
    id: string,
    label: string,
    icon: LucideIcon,
    bgColor: string,
    hoverColor: string,
    action: AdminActionType,
  ) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.bgColor = bgColor;
    this.hoverColor = hoverColor;
    this.action = action;
  }

  public isPrimary(): boolean {
    return this.bgColor !== "#21262d";
  }
}
