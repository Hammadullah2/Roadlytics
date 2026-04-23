export enum ServiceStatus {
  ONLINE = "Online",
  LIMITED = "Limited",
  OFFLINE = "Offline",
  DEGRADED = "Degraded",
}

class ServiceStatusColors {
  public static readonly online = "#2ea043";
  public static readonly limited = "#d29922";
  public static readonly offline = "#f85149";
  public static readonly degraded = "#d29922";
}

export class SystemService {
  public readonly id: string;
  public readonly name: string;
  private readonly _status: ServiceStatus;
  public readonly statusDetail: string;

  public constructor(
    id: string,
    name: string,
    status: ServiceStatus,
    statusDetail: string,
  ) {
    this.id = id;
    this.name = name;
    this._status = status;
    this.statusDetail = statusDetail;
  }

  public get status(): ServiceStatus {
    return this._status;
  }

  public get statusLabel(): string {
    return this.statusDetail
      ? `${this._status} - ${this.statusDetail}`
      : this._status;
  }

  public get dotColor(): string {
    switch (this._status) {
      case ServiceStatus.ONLINE:
        return ServiceStatusColors.online;
      case ServiceStatus.LIMITED:
        return ServiceStatusColors.limited;
      case ServiceStatus.OFFLINE:
        return ServiceStatusColors.offline;
      case ServiceStatus.DEGRADED:
        return ServiceStatusColors.degraded;
      default:
        return ServiceStatusColors.offline;
    }
  }

  public get statusTextColor(): string {
    return this.dotColor;
  }
}
