import { Project, ProjectStatus } from "@/models/Project";
import { ProjectCardViewModel } from "@/models/ProjectCardViewModel";
import { ProjectRepository } from "@/repositories/ProjectRepository";

export class ProjectsPageController {
  private readonly repository: ProjectRepository;
  private _searchQuery: string = "";
  private _statusFilter: ProjectStatus | null = null;

  public constructor() {
    this.repository = ProjectRepository.getInstance();
  }

  public setSearchQuery(query: string): void {
    this._searchQuery = query;
  }

  public setStatusFilter(status: ProjectStatus | null): void {
    this._statusFilter = status;
  }

  public getFilteredProjects(): Project[] {
    const searchedProjects = this.repository.search(this._searchQuery);

    if (this._statusFilter === null) {
      return searchedProjects;
    }

    return searchedProjects.filter(
      (project) => project.status === this._statusFilter,
    );
  }

  public getViewModels(): ProjectCardViewModel[] {
    return this.getFilteredProjects().map(
      (project) => new ProjectCardViewModel(project),
    );
  }

  public getTotalCount(): number {
    return this.repository.getTotalCount();
  }
}
