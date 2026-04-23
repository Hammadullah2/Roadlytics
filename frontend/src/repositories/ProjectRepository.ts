import { Project, ProjectStatus } from "@/models/Project";

export class ProjectRepository {
  private static instance: ProjectRepository | null = null;
  private readonly projects: Project[];

  private constructor() {
    this.projects = [
      new Project(
        "proj-1",
        "Project 1",
        "Road Assessment - Region 1",
        ProjectStatus.COMPLETED,
        "2026-01-11",
        "Region 1",
      ),
      new Project(
        "proj-2",
        "Project 2",
        "Road Assessment - Region 2",
        ProjectStatus.COMPLETED,
        "2026-01-12",
        "Region 2",
      ),
      new Project(
        "proj-3",
        "Project 3",
        "Road Assessment - Region 3",
        ProjectStatus.COMPLETED,
        "2026-01-13",
        "Region 3",
      ),
      new Project(
        "proj-4",
        "Project 4",
        "Road Assessment - Region 4",
        ProjectStatus.COMPLETED,
        "2026-01-14",
        "Region 4",
      ),
      new Project(
        "proj-5",
        "Project 5",
        "Road Assessment - Region 5",
        ProjectStatus.COMPLETED,
        "2026-01-15",
        "Region 5",
      ),
      new Project(
        "proj-6",
        "Project 6",
        "Road Assessment - Region 6",
        ProjectStatus.COMPLETED,
        "2026-01-16",
        "Region 6",
      ),
    ];
  }

  public static getInstance(): ProjectRepository {
    if (ProjectRepository.instance === null) {
      ProjectRepository.instance = new ProjectRepository();
    }

    return ProjectRepository.instance;
  }

  public getAll(): Project[] {
    return [...this.projects];
  }

  public getById(id: string): Project | undefined {
    return this.projects.find((project) => project.id === id);
  }

  public filterByStatus(status: ProjectStatus): Project[] {
    return this.projects.filter((project) => project.status === status);
  }

  public search(query: string): Project[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return this.getAll();
    }

    return this.projects.filter((project) =>
      [project.name, project.description, project.region]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  public getTotalCount(): number {
    return this.projects.length;
  }

  public getCountByStatus(status: ProjectStatus): number {
    return this.filterByStatus(status).length;
  }
}
