import {
  PipelineModule,
  PipelineModuleStatus,
} from "@/models/PipelineModule";

export class PipelineModuleRegistry {
  private readonly modules: PipelineModule[];

  public constructor() {
    this.modules = [
      new PipelineModule(
        "seg",
        "Run Road Segmentation",
        PipelineModuleStatus.READY,
        [],
      ),
      new PipelineModule(
        "class",
        "Run Condition Classification",
        PipelineModuleStatus.REQUIRES_SEG,
        ["seg"],
      ),
      new PipelineModule(
        "conn",
        "Run Connectivity Analysis",
        PipelineModuleStatus.REQUIRES_SEG,
        ["seg"],
      ),
    ];
  }

  public getAll(): PipelineModule[] {
    return [...this.modules];
  }

  public getById(id: string): PipelineModule | undefined {
    return this.modules.find((module) => module.id === id);
  }

  public unlockDependents(completedId: string): void {
    this.modules.forEach((module) => {
      if (
        module.dependsOn.includes(completedId) &&
        module.status === PipelineModuleStatus.REQUIRES_SEG
      ) {
        module.setStatus(PipelineModuleStatus.READY);
      }
    });
  }
}
