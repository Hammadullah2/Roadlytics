export enum ProjectStatus {
  COMPLETED = "Completed",
  IN_PROGRESS = "In Progress",
  PENDING = "Pending",
  FAILED = "Failed",
}

class ProjectStatusColors {
  public static readonly completed = "#2ea043";
  public static readonly inProgress = "#d29922";
  public static readonly pending = "#8b949e";
  public static readonly failed = "#f85149";
}

export class Project {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly status: ProjectStatus;
  public readonly date: string;
  public readonly region: string;

  public constructor(
    id: string,
    name: string,
    description: string,
    status: ProjectStatus,
    date: string,
    region: string,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.status = status;
    this.date = date;
    this.region = region;
  }

  public get formattedDate(): string {
    return this.date;
  }

  public get isCompleted(): boolean {
    return this.status === ProjectStatus.COMPLETED;
  }

  public get statusColor(): string {
    switch (this.status) {
      case ProjectStatus.COMPLETED:
        return ProjectStatusColors.completed;
      case ProjectStatus.IN_PROGRESS:
        return ProjectStatusColors.inProgress;
      case ProjectStatus.PENDING:
        return ProjectStatusColors.pending;
      case ProjectStatus.FAILED:
        return ProjectStatusColors.failed;
      default:
        return ProjectStatusColors.pending;
    }
  }
}
