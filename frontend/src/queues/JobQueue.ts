import { JobStatus, ProcessingJob } from "@/models/ProcessingJob";

export class JobQueue {
  private static instance: JobQueue | null = null;
  private readonly jobs: ProcessingJob[];

  private constructor() {
    this.jobs = [
      new ProcessingJob("#472", "Segmentation", JobStatus.RUNNING, 54),
      new ProcessingJob("#470", "Classification", JobStatus.COMPLETED, 100),
    ];
  }

  public static getInstance(): JobQueue {
    if (JobQueue.instance === null) {
      JobQueue.instance = new JobQueue();
    }

    return JobQueue.instance;
  }

  public getAll(): ProcessingJob[] {
    return [...this.jobs];
  }

  public getRunningJobs(): ProcessingJob[] {
    return this.jobs.filter((job) => job.isRunning);
  }

  public getCompletedJobs(): ProcessingJob[] {
    return this.jobs.filter((job) => job.isCompleted);
  }

  public addJob(job: ProcessingJob): void {
    this.jobs.push(job);
  }

  public findById(jobId: string): ProcessingJob | undefined {
    return this.jobs.find((job) => job.jobId === jobId);
  }
}
