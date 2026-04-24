import {
  PipelineModule,
  PipelineModuleStatus,
} from "@/models/PipelineModule";
import { Region } from "@/models/Region";
import { JobStatus, ProcessingJob } from "@/models/ProcessingJob";
import { PipelineModuleRegistry } from "@/registries/PipelineModuleRegistry";
import { RegionRegistry } from "@/registries/RegionRegistry";
import { JobQueue } from "@/queues/JobQueue";

class ProcessingJobFactory {
  private static nextNumericId: number = 473;

  public static createJob(moduleId: string): ProcessingJob {
    const jobType = ProcessingJobFactory.getJobType(moduleId);
    const job = new ProcessingJob(
      `#${ProcessingJobFactory.nextNumericId}`,
      jobType,
      JobStatus.RUNNING,
      0,
    );

    ProcessingJobFactory.nextNumericId += 1;
    return job;
  }

  public static getJobType(moduleId: string): string {
    switch (moduleId) {
      case "seg":
        return "Segmentation";
      case "class":
        return "Classification";
      case "conn":
        return "Connectivity";
      default:
        return "Processing";
    }
  }
}

export class ProcessingPageController {
  private readonly regionRegistry: RegionRegistry;
  private readonly moduleRegistry: PipelineModuleRegistry;
  private readonly jobQueue: JobQueue;
  private _selectedRegion: Region;
  private onUpdate: (() => void) | null = null;
  private readonly intervals: Map<string, number> = new Map<string, number>();

  public constructor() {
    this.regionRegistry = RegionRegistry.getInstance();
    this.moduleRegistry = new PipelineModuleRegistry();
    this.jobQueue = JobQueue.getInstance();
    this._selectedRegion = this.regionRegistry.getDefault();
  }

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public getRegions(): Region[] {
    return this.regionRegistry.getAll();
  }

  public getSelectedRegion(): Region {
    return this._selectedRegion;
  }

  public selectRegion(id: string): void {
    const region = this.regionRegistry.getById(id);
    if (!region) {
      return;
    }

    this._selectedRegion = region;
    this.notifyUpdate();
  }

  public getModules(): PipelineModule[] {
    return this.moduleRegistry.getAll();
  }

  public runModule(moduleId: string): ProcessingJob | null {
    const module = this.moduleRegistry.getById(moduleId);
    if (!module || !module.isRunnable) {
      return null;
    }

    module.setStatus(PipelineModuleStatus.RUNNING);
    const job = ProcessingJobFactory.createJob(moduleId);
    this.jobQueue.addJob(job);
    this.notifyUpdate();
    this.simulateProgress(job.jobId, () => {
      this.notifyUpdate();
    });
    return job;
  }

  public getActiveJobs(): ProcessingJob[] {
    return this.jobQueue.getAll();
  }

  public simulateProgress(jobId: string, onUpdate: (progress: number) => void): void {
    if (this.intervals.has(jobId)) {
      return;
    }

    const job = this.jobQueue.findById(jobId);
    if (!job || !job.isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const currentJob = this.jobQueue.findById(jobId);
      if (!currentJob) {
        this.clearInterval(jobId);
        return;
      }

      const nextProgress = currentJob.progress + 5;
      currentJob.updateProgress(nextProgress);
      onUpdate(currentJob.progress);

      if (currentJob.progress >= 100) {
        currentJob.complete();
        this.clearInterval(jobId);

        const completedModuleId = this.getModuleIdForJobType(currentJob.type);
        const module = this.moduleRegistry.getById(completedModuleId);
        if (module) {
          module.setStatus(PipelineModuleStatus.COMPLETED);
        }

        this.moduleRegistry.unlockDependents(completedModuleId);
        this.notifyUpdate();
      }
    }, 500);

    this.intervals.set(jobId, intervalId);
  }

  public startInitialSimulations(): void {
    this.jobQueue.getRunningJobs().forEach((job) => {
      this.simulateProgress(job.jobId, () => {
        this.notifyUpdate();
      });
    });
  }

  public dispose(): void {
    this.intervals.forEach((intervalId) => {
      window.clearInterval(intervalId);
    });
    this.intervals.clear();
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }

  private clearInterval(jobId: string): void {
    const intervalId = this.intervals.get(jobId);
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
      this.intervals.delete(jobId);
    }
  }

  private getModuleIdForJobType(jobType: string): string {
    switch (jobType) {
      case "Segmentation":
        return "seg";
      case "Classification":
        return "class";
      case "Connectivity":
        return "conn";
      default:
        return "";
    }
  }
}
