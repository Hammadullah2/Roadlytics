import { Database } from "lucide-react";

import { MetricThreshold, SystemMetric } from "@/models/SystemMetric";

export class StorageMetric extends SystemMetric {
  private _usedGb: number;
  private _totalTb: number;

  public constructor(usedGb: number, totalTb: number) {
    const percent = Math.round((usedGb / (totalTb * 1024)) * 100);
    super(
      "storage",
      "Storage Footprint",
      Database,
      "#8957e5",
      percent,
      new MetricThreshold(80, 95),
    );
    this._usedGb = usedGb;
    this._totalTb = totalTb;
  }

  public get displayLabel(): string {
    return `${this._usedGb} GB in use`;
  }

  public get barColor(): string {
    return "#8957e5";
  }

  public get displayValue(): string {
    return `${this.value}%`;
  }
}
