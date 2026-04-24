import { RotateCw } from "lucide-react";
import { useState } from "react";

import { SystemMonitoringController } from "@/controllers/SystemMonitoringController";
import { LogEntry } from "@/components/admin/logs/LogEntry";

type SystemLogsCardProps = {
  controller: SystemMonitoringController;
  onUpdated: () => void;
};

class SystemLogsCardCopy {
  public static readonly title = "System Logs";
  public static readonly refreshLabel = "Refresh";
}

export const SystemLogsCard = ({
  controller,
  onUpdated,
}: SystemLogsCardProps): JSX.Element => {
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-base font-bold text-[color:var(--text-primary)]">
          {SystemLogsCardCopy.title}
        </h2>
        <button
          type="button"
          onClick={() => {
            setIsRefreshing(true);
            void controller.load().finally(() => {
              onUpdated();
              setIsRefreshing(false);
            });
          }}
          className="flex items-center gap-1.5 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-3.5 py-1.5 text-[0.8rem] text-[color:var(--text-secondary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] hover:text-white"
        >
          <RotateCw size={14} className={isRefreshing ? "animate-[refreshSpin_400ms_linear]" : ""} />
          <span>{SystemLogsCardCopy.refreshLabel}</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]">
        {controller.getLogs().length === 0 ? (
          <div className="px-4 py-6 text-[0.875rem] text-[color:var(--text-secondary)]">
            No system logs recorded yet.
          </div>
        ) : (
          controller.getLogs().map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </section>
  );
};
