export enum JobStatus {
  RUNNING = "Running",
  COMPLETED = "Completed",
  FAILED = "Failed",
  PENDING = "Pending",
}

class ProcessingJobColors {
  public static readonly running = "#2ea043";
  public static readonly completed = "#2ea043";
  public static readonly failed = "#f85149";
  public static readonly pending = "#8b949e";
}

export class ProcessingJob {
  public readonly jobId: string;
  public readonly type: string;
  private _status: JobStatus;
  private _progress: number;

  public constructor(
    jobId: string,
    type: string,
    status: JobStatus,
    progress: number,
  ) {
    this.jobId = jobId;
    this.type = type;
    this._status = status;
    this._progress = progress;
  }

  public get status(): JobStatus {
    return this._status;
  }

  public get progress(): number {
    return this._progress;
  }

  public get isRunning(): boolean {
    return this._status === JobStatus.RUNNING;
  }

  public get isCompleted(): boolean {
    return this._status === JobStatus.COMPLETED;
  }

  public get statusColor(): string {
    switch (this._status) {
      case JobStatus.RUNNING:
        return ProcessingJobColors.running;
      case JobStatus.COMPLETED:
        return ProcessingJobColors.completed;
      case JobStatus.FAILED:
        return ProcessingJobColors.failed;
      case JobStatus.PENDING:
        return ProcessingJobColors.pending;
      default:
        return ProcessingJobColors.pending;
    }
  }

  public get dotColor(): string {
    return this.statusColor;
  }

  public get progressLabel(): string {
    if (this._status === JobStatus.COMPLETED) {
      return JobStatus.COMPLETED;
    }

    if (this._status === JobStatus.FAILED) {
      return JobStatus.FAILED;
    }

    return `Progress: ${this._progress}%`;
  }

  public updateProgress(value: number): void {
    this._progress = Math.max(0, Math.min(100, value));
  }

  public complete(): void {
    this._status = JobStatus.COMPLETED;
    this._progress = 100;
  }

  public fail(): void {
    this._status = JobStatus.FAILED;
  }
}
