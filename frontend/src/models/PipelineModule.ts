export enum PipelineModuleStatus {
  READY = "Ready",
  REQUIRES_SEG = "Requires Seg.",
  RUNNING = "Running",
  COMPLETED = "Completed",
  FAILED = "Failed",
}

class PipelineModuleColors {
  public static readonly ready = "#2ea043";
  public static readonly requiresSeg = "#d29922";
  public static readonly running = "#388bfd";
  public static readonly completed = "#2ea043";
  public static readonly failed = "#f85149";
}

export class PipelineModule {
  public readonly id: string;
  public readonly label: string;
  private _status: PipelineModuleStatus;
  public readonly dependsOn: string[];

  public constructor(
    id: string,
    label: string,
    status: PipelineModuleStatus,
    dependsOn: string[],
  ) {
    this.id = id;
    this.label = label;
    this._status = status;
    this.dependsOn = dependsOn;
  }

  public get status(): PipelineModuleStatus {
    return this._status;
  }

  public get isRunnable(): boolean {
    return this._status === PipelineModuleStatus.READY;
  }

  public get statusColor(): string {
    switch (this._status) {
      case PipelineModuleStatus.READY:
        return PipelineModuleColors.ready;
      case PipelineModuleStatus.REQUIRES_SEG:
        return PipelineModuleColors.requiresSeg;
      case PipelineModuleStatus.RUNNING:
        return PipelineModuleColors.running;
      case PipelineModuleStatus.COMPLETED:
        return PipelineModuleColors.completed;
      case PipelineModuleStatus.FAILED:
        return PipelineModuleColors.failed;
      default:
        return PipelineModuleColors.requiresSeg;
    }
  }

  public setStatus(status: PipelineModuleStatus): void {
    this._status = status;
  }
}
