import { ChevronDown, Download, Plus } from "lucide-react";
import { useState } from "react";

import { ProjectManagementController } from "@/controllers/ProjectManagementController";
import { AdminProjectStatus } from "@/models/AdminProject";
import { AdminSearchInput } from "@/components/admin/shared/AdminSearchInput";
import { ProjectsTable } from "@/components/admin/tables/ProjectsTable";

type ProjectManagementPanelProps = {
  controller: ProjectManagementController;
};

class ProjectManagementPanelCopy {
  public static readonly title = "Project Management";
  public static readonly exportLabel = "Export";
  public static readonly newProjectLabel = "+ New Project";
  public static readonly searchPlaceholder = "Search projects...";
  public static readonly allStatus = "All Status";
  public static readonly deleteConfirm = "Are you sure you want to delete this project?";
}

export const ProjectManagementPanel = ({
  controller,
}: ProjectManagementPanelProps): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(ProjectManagementPanelCopy.allStatus);
  const projects = controller.getFilteredProjects();

  return (
    <section>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[1.25rem] font-bold text-[color:var(--text-primary)]">
          {ProjectManagementPanelCopy.title}
        </h1>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => controller.handleExport()}
            className="flex items-center gap-2 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] px-4 py-2 text-[0.875rem] text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--border-subtle)]"
          >
            <Download size={16} />
            <span>{ProjectManagementPanelCopy.exportLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => controller.handleNewProject()}
            className="flex items-center gap-2 rounded-[8px] bg-[color:var(--accent-green)] px-5 py-2 text-[0.875rem] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
          >
            <Plus size={16} />
            <span>{ProjectManagementPanelCopy.newProjectLabel}</span>
          </button>
        </div>
      </div>

      {controller.infoMessage ? (
        <div className="mb-4 rounded-[10px] border border-[color:var(--accent-green)]/30 bg-[color:var(--accent-green)]/10 px-4 py-3 text-sm text-[color:var(--text-primary)]">
          {controller.infoMessage}
        </div>
      ) : null}

      {controller.errorMessage ? (
        <div className="mb-4 rounded-[10px] border border-[#f85149]/30 bg-[#f85149]/10 px-4 py-3 text-sm text-[#fda4af]">
          {controller.errorMessage}
        </div>
      ) : null}

      <div className="mb-5 flex gap-3">
        <div className="flex-1">
          <AdminSearchInput
            value={searchQuery}
            placeholder={ProjectManagementPanelCopy.searchPlaceholder}
            onChange={(value) => {
              setSearchQuery(value);
              controller.setSearchQuery(value);
            }}
          />
        </div>

        <div className="relative w-[140px]">
          <select
            value={statusFilter}
            onChange={(event) => {
              const value = event.target.value;
              setStatusFilter(value);
              controller.setStatusFilter(
                value === ProjectManagementPanelCopy.allStatus
                  ? null
                  : (value as AdminProjectStatus),
              );
            }}
            className="h-[42px] w-full appearance-none rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3 pr-9 text-[0.875rem] text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
          >
            <option>{ProjectManagementPanelCopy.allStatus}</option>
            {Object.values(AdminProjectStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[color:var(--text-nav-label)]">
            <ChevronDown size={16} />
          </span>
        </div>
      </div>

      <ProjectsTable
        projects={projects}
        isLoading={controller.isLoading}
        searchQuery={searchQuery}
        onEdit={(id) => controller.handleEditProject(id)}
        onDelete={(id) => {
          if (window.confirm(ProjectManagementPanelCopy.deleteConfirm)) {
            void controller.deleteProject(id);
          }
        }}
      />
    </section>
  );
};
