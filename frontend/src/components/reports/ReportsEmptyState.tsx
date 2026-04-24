import { FileX } from "lucide-react";

class ReportsEmptyStateCopy {
  public static readonly title = "No reports available";
}

export const ReportsEmptyState = (): JSX.Element => {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[color:var(--border-subtle)]">
      <FileX size={48} color="#30363d" />
      <p className="mt-4 text-[0.9rem] text-[color:var(--text-secondary)]">
        {ReportsEmptyStateCopy.title}
      </p>
    </div>
  );
};
