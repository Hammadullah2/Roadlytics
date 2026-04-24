import { Cpu } from "lucide-react";

import { MetricThreshold, SystemMetric } from "@/models/SystemMetric";

export class CpuMetric extends SystemMetric {
  public constructor(currentPercent: number) {
    super(
      "cpu",
      "Processing Load",
      Cpu,
      "#2ea043",
      currentPercent,
      new MetricThreshold(70, 90),
    );
  }

  public get displayLabel(): string {
    return "Derived job activity";
  }

  public get barColor(): string {
    return "#2ea043";
  }

  public get displayValue(): string {
    return `${this.value}%`;
  }
}
