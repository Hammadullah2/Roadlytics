import { SystemLogEntry } from "@/models/SystemLogEntry";

type LogEntryProps = {
  entry: SystemLogEntry;
};

export const LogEntry = ({ entry }: LogEntryProps): JSX.Element => {
  return (
    <div className="flex items-baseline gap-4 border-b border-[color:var(--bg-card-hover)] px-4 py-2.5 font-['Courier_New',monospace] text-[0.8rem] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] last:border-b-0">
      <span className="min-w-[60px] shrink-0 text-[color:var(--text-nav-label)]">
        {entry.timestamp}
      </span>
      <span
        className="min-w-[65px] rounded px-1.5 py-0.5 font-bold"
        style={{ color: entry.levelColor, backgroundColor: entry.levelBgColor }}
      >
        {entry.level}
      </span>
      <span className="text-[color:var(--text-primary)]">{entry.message}</span>
    </div>
  );
};
