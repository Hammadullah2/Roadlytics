export type PipelineModuleRowData = {
  id: string;
  label: string;
  statusLabel: string;
  statusColor: string;
  disabled: boolean;
  isRunning: boolean;
  onRun: () => void;
};

type PipelineModuleRowProps = {
  module: PipelineModuleRowData;
};

class PipelineModuleRowCopy {
  public static readonly statusPrefix = "Status:";
}

export const PipelineModuleRow = ({
  module,
}: PipelineModuleRowProps): JSX.Element => {
  const runnableClassName = !module.disabled
    ? "bg-[color:var(--accent-green)] text-white hover:bg-[color:var(--accent-green-hover)] cursor-pointer"
    : "bg-[color:var(--border-subtle)] text-[color:var(--text-nav-label)] cursor-not-allowed";

  return (
    <div className="flex items-center gap-4 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3.5">
      <button
        type="button"
        disabled={module.disabled}
        onClick={() => {
          module.onRun();
        }}
        className={`rounded-[6px] px-4 py-2 text-sm font-semibold transition-colors duration-150 ${runnableClassName}`}
      >
        {module.label}
      </button>

      <div className="text-sm">
        <span className="text-[color:var(--text-secondary)]">
          {`${PipelineModuleRowCopy.statusPrefix} `}
        </span>
        <span style={{ color: module.statusColor }}>
          {module.statusLabel}
        </span>
      </div>
    </div>
  );
};
