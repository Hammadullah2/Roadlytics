import { AdminProject } from "@/models/AdminProject";
import { ProjectTableRow } from "@/components/admin/tables/ProjectTableRow";

type ProjectsTableProps = {
  projects: AdminProject[];
  isLoading: boolean;
  searchQuery: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

class ProjectsTableCopy {
  public static readonly headers: string[] = [
    "Project Name",
    "Owner",
    "Region",
    "Status",
    "Created",
    "Actions",
  ];

  public static emptyMessage(query: string): string {
    return `No results found for '${query}'`;
  }
}

export const ProjectsTable = ({
  projects,
  isLoading,
  searchQuery,
  onEdit,
  onDelete,
}: ProjectsTableProps): JSX.Element => {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]">
            {ProjectsTableCopy.headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-left text-[0.8rem] font-semibold text-[color:var(--text-nav-label)]"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={ProjectsTableCopy.headers.length}
                className="px-4 py-8 text-center text-[0.875rem] text-[color:var(--text-secondary)]"
              >
                Loading projects...
              </td>
            </tr>
          ) : projects.length === 0 ? (
            <tr>
              <td
                colSpan={ProjectsTableCopy.headers.length}
                className="px-4 py-8 text-center text-[0.875rem] text-[color:var(--text-secondary)]"
              >
                {ProjectsTableCopy.emptyMessage(searchQuery)}
              </td>
            </tr>
          ) : (
            projects.map((project) => (
              <ProjectTableRow
                key={project.id}
                project={project}
                onEdit={() => onEdit(project.id)}
                onDelete={() => onDelete(project.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
