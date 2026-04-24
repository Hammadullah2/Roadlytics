import { Globe } from "lucide-react";

import { MetricThreshold, SystemMetric } from "@/models/SystemMetric";

export type NetworkTrafficLevel = "Normal" | "High" | "Critical";

class NetworkTrafficColors {
  public static readonly normal = "#2ea043";
  public static readonly high = "#d29922";
  public static readonly critical = "#f85149";
}

export class NetworkMetric extends SystemMetric {
  public readonly downloadMbps: number;
  public readonly uploadMbps: number;
  public readonly trafficLevel: NetworkTrafficLevel;

  public constructor(
    downloadMbps: number,
    uploadMbps: number,
    trafficLevel: NetworkTrafficLevel,
  ) {
    super(
      "network",
      "Traffic Estimate",
      Globe,
      "#d29922",
      0,
      new MetricThreshold(500, 800),
    );
    this.downloadMbps = downloadMbps;
    this.uploadMbps = uploadMbps;
    this.trafficLevel = trafficLevel;
  }

  public get displayLabel(): string {
    return `Down: ${this.downloadMbps} Mbps`;
  }

  public get uploadLabel(): string {
    return `Up: ${this.uploadMbps} Mbps`;
  }

  public get barColor(): string {
    return "#d29922";
  }

  public get displayValue(): string {
    return this.trafficLevel;
  }

  public get trafficColor(): string {
    switch (this.trafficLevel) {
      case "Normal":
        return NetworkTrafficColors.normal;
      case "High":
        return NetworkTrafficColors.high;
      case "Critical":
        return NetworkTrafficColors.critical;
      default:
        return NetworkTrafficColors.normal;
    }
  }

  public get hasProgressBar(): boolean {
    return false;
  }
}
