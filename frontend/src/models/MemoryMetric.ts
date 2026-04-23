import { HardDrive } from "lucide-react";

import { MetricThreshold, SystemMetric } from "@/models/SystemMetric";

export class MemoryMetric extends SystemMetric {
  private readonly totalGb: number = 16;
  private _usedGb: number;

  public constructor(usedGb: number) {
    const percent = Math.round((usedGb / 16) * 100);
    super(
      "memory",
      "Working Set Estimate",
      HardDrive,
      "#388bfd",
      percent,
      new MetricThreshold(75, 90),
    );
    this._usedGb = usedGb;
  }

  public get usedGb(): number {
    return this._usedGb;
  }

  public setUsedGb(usedGb: number): void {
    this._usedGb = usedGb;
    this.updateValue(Math.round((usedGb / this.totalGb) * 100));
  }

  public get displayLabel(): string {
    return `${this._usedGb.toFixed(1)} GB estimated`;
  }

  public get barColor(): string {
    return "#388bfd";
  }

  public get displayValue(): string {
    return `${this.value}%`;
  }
}
