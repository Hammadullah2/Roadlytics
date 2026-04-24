import { adminClient } from "@/lib/adminClient";
import { AdminProject, AdminProjectStatus } from "@/models/AdminProject";
import type { BackendAdminProject } from "@/types";

type NavigateHandler = (path: string) => void;

export class ProjectManagementController {
  private _searchQuery: string = "";
  private _statusFilter: AdminProjectStatus | null = null;
  private _projects: AdminProject[] = [];
  private _isLoading: boolean = false;
  private _errorMessage: string | null = null;
  private _infoMessage: string | null = null;
  private navigateHandler: NavigateHandler = () => undefined;
  private onUpdate: (() => void) | null = null;

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public setNavigateHandler(handler: NavigateHandler): void {
    this.navigateHandler = handler;
  }

  public get isLoading(): boolean {
    return this._isLoading;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public get infoMessage(): string | null {
    return this._infoMessage;
  }

  public clearInfoMessage(): void {
    this._infoMessage = null;
    this.notifyUpdate();
  }

  public async load(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const projects = await adminClient.listProjects();
      this._projects = projects.map(mapBackendProject);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to load projects.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public setSearchQuery(query: string): void {
    this._searchQuery = query;
  }

  public setStatusFilter(status: AdminProjectStatus | null): void {
    this._statusFilter = status;
  }

  public getFilteredProjects(): AdminProject[] {
    return this._projects.filter((project) => {
      return (
        project.matchesSearch(this._searchQuery) &&
        project.matchesStatus(this._statusFilter)
      );
    });
  }

  public async deleteProject(id: string): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      await adminClient.deleteProject(id);
      this._projects = this._projects.filter((project) => project.id !== id);
      this.setInfoMessage("Project deleted successfully");
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to delete project.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public handleEditProject(id: string): void {
    this.navigateHandler(`/projects/${id}`);
  }

  public handleNewProject(): void {
    this.navigateHandler("/projects");
  }

  public handleExport(): void {
    const payload = this.getFilteredProjects().map((project) => ({
      id: project.id,
      name: project.name,
      owner: project.owner,
      region: project.region,
      status: project.status,
      created_on: project.createdOn,
    }));

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "admin-projects.json";
    link.click();
    window.URL.revokeObjectURL(url);
    this.setInfoMessage("Project export downloaded");
  }

  public getTotalCount(): number {
    return this._projects.length;
  }

  public getFilteredCount(): number {
    return this.getFilteredProjects().length;
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }

  private setInfoMessage(message: string): void {
    this._infoMessage = message;
    this.notifyUpdate();
    window.setTimeout(() => {
      this._infoMessage = null;
      this.notifyUpdate();
    }, 2500);
  }
}

const mapBackendProject = (project: BackendAdminProject): AdminProject => {
  const regionCount = project.region_count;
  const regionLabel = `${regionCount} region${regionCount === 1 ? "" : "s"}`;

  return new AdminProject(
    project.id,
    project.name,
    project.owner_name,
    regionLabel,
    mapProjectStatus(project.status),
    formatShortDate(project.created_at),
  );
};

const mapProjectStatus = (status: string): AdminProjectStatus => {
  switch (status) {
    case "Completed":
      return AdminProjectStatus.COMPLETED;
    case "In Progress":
      return AdminProjectStatus.IN_PROGRESS;
    case "Failed":
      return AdminProjectStatus.FAILED;
    case "Pending":
    default:
      return AdminProjectStatus.PENDING;
  }
};

const formatShortDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};
