export enum ServiceHealthStatus {
  ONLINE = "Online",
  LIMITED = "Limited",
  OFFLINE = "Offline",
  DEGRADED = "Degraded",
}

class ServiceHealthColors {
  public static readonly online = "#2ea043";
  public static readonly limited = "#d29922";
  public static readonly offline = "#f85149";
  public static readonly degraded = "#d29922";
}

export class ServiceHealth {
  public readonly id: string;
  public readonly name: string;
  private _status: ServiceHealthStatus;
  public readonly uptimePercent: number;

  public constructor(
    id: string,
    name: string,
    status: ServiceHealthStatus,
    uptimePercent: number,
  ) {
    this.id = id;
    this.name = name;
    this._status = status;
    this.uptimePercent = uptimePercent;
  }

  public get status(): ServiceHealthStatus {
    return this._status;
  }

  public get statusLabel(): string {
    return this._status;
  }

  public get dotColor(): string {
    switch (this._status) {
      case ServiceHealthStatus.ONLINE:
        return ServiceHealthColors.online;
      case ServiceHealthStatus.LIMITED:
        return ServiceHealthColors.limited;
      case ServiceHealthStatus.OFFLINE:
        return ServiceHealthColors.offline;
      case ServiceHealthStatus.DEGRADED:
        return ServiceHealthColors.degraded;
      default:
        return ServiceHealthColors.offline;
    }
  }

  public get statusTextColor(): string {
    return this.dotColor;
  }

  public get uptimeLabel(): string {
    return `Uptime: ${this.uptimePercent.toFixed(2)}%`;
  }

  public get isHealthy(): boolean {
    return this._status === ServiceHealthStatus.ONLINE;
  }
}
