import { AdminProject, AdminProjectStatus } from "@/models/AdminProject";

export class AdminProjectRepository {
  private static instance: AdminProjectRepository | null = null;
  private readonly projects: AdminProject[];

  private constructor() {
    this.projects = [
      new AdminProject("ap1", "Road Assessment North", "John Doe", "North District", AdminProjectStatus.COMPLETED, "2026-01-10"),
      new AdminProject("ap2", "Highway Connectivity", "Jane Smith", "East Region", AdminProjectStatus.IN_PROGRESS, "2026-01-12"),
      new AdminProject("ap3", "Rural Roads Survey", "Bob Wilson", "South Area", AdminProjectStatus.COMPLETED, "2026-01-08"),
      new AdminProject("ap4", "Urban Infrastructure", "Alice Brown", "Central", AdminProjectStatus.PENDING, "2026-01-15"),
      new AdminProject("ap5", "Bridge Assessment", "Charlie Davis", "West Zone", AdminProjectStatus.IN_PROGRESS, "2026-01-11"),
    ];
  }

  public static getInstance(): AdminProjectRepository {
    if (AdminProjectRepository.instance === null) {
      AdminProjectRepository.instance = new AdminProjectRepository();
    }

    return AdminProjectRepository.instance;
  }

  public getAll(): AdminProject[] {
    return [...this.projects];
  }

  public getById(id: string): AdminProject | undefined {
    return this.projects.find((project) => project.id === id);
  }

  public search(query: string): AdminProject[] {
    return this.projects.filter((project) => project.matchesSearch(query));
  }

  public filterByStatus(status: AdminProjectStatus | null): AdminProject[] {
    return this.projects.filter((project) => project.matchesStatus(status));
  }

  public searchAndFilter(
    query: string,
    status: AdminProjectStatus | null,
  ): AdminProject[] {
    return this.projects.filter(
      (project) => project.matchesSearch(query) && project.matchesStatus(status),
    );
  }

  public deleteById(id: string): void {
    const index = this.projects.findIndex((project) => project.id === id);
    if (index >= 0) {
      this.projects.splice(index, 1);
    }
  }

  public add(project: AdminProject): void {
    this.projects.push(project);
  }

  public export(): string {
    return JSON.stringify(this.projects, null, 2);
  }
}
