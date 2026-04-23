import type { LucideIcon } from "lucide-react";

export type StatTrendType = "up" | "neutral";

export class StatCard {
  public readonly id: string;
  public readonly label: string;
  public readonly value: string;
  public readonly trend: string;
  public readonly trendType: StatTrendType;
  public readonly iconBg: string;
  public readonly icon: LucideIcon;

  public constructor(
    id: string,
    label: string,
    value: string,
    trend: string,
    trendType: StatTrendType,
    iconBg: string,
    icon: LucideIcon,
  ) {
    this.id = id;
    this.label = label;
    this.value = value;
    this.trend = trend;
    this.trendType = trendType;
    this.iconBg = iconBg;
    this.icon = icon;
  }

  public get trendColor(): string {
    return this.trendType === "up" ? "#2ea043" : "#8b949e";
  }

  public get hasTrend(): boolean {
    return this.trend.length > 0;
  }
}
