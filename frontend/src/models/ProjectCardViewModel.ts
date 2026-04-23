import { Project } from "@/models/Project";

export class ProjectCardViewModel {
  private readonly project: Project;

  public constructor(project: Project) {
    this.project = project;
  }

  public get id(): string {
    return this.project.id;
  }

  public get title(): string {
    return this.project.name;
  }

  public get subtitle(): string {
    return this.project.description;
  }

  public get statusLabel(): string {
    return this.project.status;
  }

  public get statusColor(): string {
    return this.project.statusColor;
  }

  public get displayDate(): string {
    return this.project.formattedDate;
  }

  public get route(): string {
    return `/projects/${this.project.id}`;
  }
}
