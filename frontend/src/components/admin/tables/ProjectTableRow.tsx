import { AdminProject } from "@/models/AdminProject";
import { StatusBadge } from "@/components/admin/shared/StatusBadge";
import { TableActionButtons } from "@/components/admin/shared/TableActionButtons";

type ProjectTableRowProps = {
  project: AdminProject;
  onEdit: () => void;
  onDelete: () => void;
};

export const ProjectTableRow = ({
  project,
  onEdit,
  onDelete,
}: ProjectTableRowProps): JSX.Element => {
  return (
    <tr className="border-b border-[color:var(--bg-card-hover)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] last:border-b-0">
      <td className="px-4 py-3 text-[0.875rem] font-medium text-[color:var(--text-primary)]">
        {project.name}
      </td>
      <td className="px-4 py-3 text-[0.875rem] text-[color:var(--text-secondary)]">
        {project.owner}
      </td>
      <td className="px-4 py-3 text-[0.875rem] text-[color:var(--text-secondary)]">
        {project.region}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          label={project.status}
          backgroundColor={project.statusBadgeColor}
          textColor={project.statusTextColor}
        />
      </td>
      <td className="px-4 py-3 text-[0.875rem] text-[color:var(--text-secondary)]">
        {project.createdOn}
      </td>
      <td className="px-4 py-3">
        <TableActionButtons onEdit={onEdit} onDelete={onDelete} />
      </td>
    </tr>
  );
};
