import { FolderOpen } from "lucide-react";

class ProjectsEmptyStateCopy {
  public static readonly title = "No projects found";
  public static readonly subtitle = "Projects will appear here once created";
}

export const ProjectsEmptyState = (): JSX.Element => {
  return (
    <div className="col-span-full flex min-h-[320px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[color:var(--border-subtle)] bg-transparent text-center">
      <FolderOpen size={48} color="#30363d" />
      <p className="mt-4 text-[0.9rem] text-[color:var(--text-secondary)]">
        {ProjectsEmptyStateCopy.title}
      </p>
      <p className="mt-1 text-[0.8rem] text-[color:var(--text-nav-label)]">
        {ProjectsEmptyStateCopy.subtitle}
      </p>
    </div>
  );
};
