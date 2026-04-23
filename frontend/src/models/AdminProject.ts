export enum AdminProjectStatus {
  COMPLETED = "Completed",
  IN_PROGRESS = "In Progress",
  PENDING = "Pending",
  FAILED = "Failed",
}

class AdminProjectStatusColors {
  public static readonly completed = "#2ea043";
  public static readonly inProgress = "#1f6feb";
  public static readonly pending = "#6e7681";
  public static readonly failed = "#da3633";
}

export class AdminProject {
  public readonly id: string;
  public readonly name: string;
  public readonly owner: string;
  public readonly region: string;
  private _status: AdminProjectStatus;
  public readonly createdOn: string;

  public constructor(
    id: string,
    name: string,
    owner: string,
    region: string,
    status: AdminProjectStatus,
    createdOn: string,
  ) {
    this.id = id;
    this.name = name;
    this.owner = owner;
    this.region = region;
    this._status = status;
    this.createdOn = createdOn;
  }

  public get status(): AdminProjectStatus {
    return this._status;
  }

  public get statusBadgeColor(): string {
    switch (this._status) {
      case AdminProjectStatus.COMPLETED:
        return AdminProjectStatusColors.completed;
      case AdminProjectStatus.IN_PROGRESS:
        return AdminProjectStatusColors.inProgress;
      case AdminProjectStatus.PENDING:
        return AdminProjectStatusColors.pending;
      case AdminProjectStatus.FAILED:
        return AdminProjectStatusColors.failed;
      default:
        return AdminProjectStatusColors.pending;
    }
  }

  public get statusTextColor(): string {
    return "white";
  }

  public matchesSearch(query: string): boolean {
    const normalizedQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(normalizedQuery) ||
      this.owner.toLowerCase().includes(normalizedQuery) ||
      this.region.toLowerCase().includes(normalizedQuery)
    );
  }

  public matchesStatus(filter: AdminProjectStatus | null): boolean {
    return filter === null || this._status === filter;
  }

  public updateStatus(status: AdminProjectStatus): void {
    this._status = status;
  }
}
