import type { LucideIcon } from "lucide-react";

export type MetricSeverity = "normal" | "warning" | "critical";

export class MetricThreshold {
  public readonly warning: number;
  public readonly critical: number;

  public constructor(warning: number, critical: number) {
    this.warning = warning;
    this.critical = critical;
  }

  public classify(value: number): MetricSeverity {
    if (value >= this.critical) {
      return "critical";
    }
    if (value >= this.warning) {
      return "warning";
    }
    return "normal";
  }
}

export abstract class SystemMetric {
  public readonly id: string;
  public readonly label: string;
  public readonly icon: LucideIcon;
  public readonly iconColor: string;
  protected _value: number;
  public readonly threshold: MetricThreshold;

  public constructor(
    id: string,
    label: string,
    icon: LucideIcon,
    iconColor: string,
    value: number,
    threshold: MetricThreshold,
  ) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.iconColor = iconColor;
    this._value = value;
    this.threshold = threshold;
  }

  public get value(): number {
    return this._value;
  }

  public get percentage(): number {
    return this._value;
  }

  public abstract get displayLabel(): string;
  public abstract get barColor(): string;
  public abstract get displayValue(): string;

  public get severity(): MetricSeverity {
    return this.threshold.classify(this._value);
  }

  public updateValue(newValue: number): void {
    this._value = newValue;
  }
}
