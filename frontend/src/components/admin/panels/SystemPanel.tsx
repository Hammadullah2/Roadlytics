import { useEffect, useState } from "react";

import { SystemMonitoringController } from "@/controllers/SystemMonitoringController";
import { SystemLogsCard } from "@/components/admin/logs/SystemLogsCard";
import { MetricsGrid } from "@/components/admin/monitoring/MetricsGrid";
import { ServiceStatusGrid } from "@/components/admin/services/ServiceStatusGrid";

type SystemPanelProps = {
  controller: SystemMonitoringController;
};

class SystemPanelCopy {
  public static readonly monitoringLabel = "Operational Snapshot";
  public static readonly serviceLabel = "Service Status";
  public static readonly helperText = "These are application-level indicators derived from platform activity, not raw host telemetry.";
}

export const SystemPanel = ({ controller }: SystemPanelProps): JSX.Element => {
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    return controller.startLiveUpdates(() => {
      setTick((value) => value + 1);
    });
  }, [controller]);

  if (controller.isLoading && controller.getLogs().length === 0) {
    return (
      <section className="rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5 text-[0.95rem] text-[color:var(--text-secondary)]">
        Loading operational snapshot...
      </section>
    );
  }

  if (controller.errorMessage && controller.getLogs().length === 0) {
    return (
      <section className="rounded-[14px] border border-[#f85149]/30 bg-[#f85149]/10 px-6 py-5 text-[0.95rem] text-[#fda4af]">
        {controller.errorMessage}
      </section>
    );
  }

  return (
    <section>
      {controller.errorMessage ? (
        <div className="mb-4 rounded-[10px] border border-[#f85149]/30 bg-[#f85149]/10 px-4 py-3 text-sm text-[#fda4af]">
          {controller.errorMessage}
        </div>
      ) : null}

      <h2 className="mb-3.5 text-base font-bold text-[color:var(--text-primary)]">
        {SystemPanelCopy.monitoringLabel}
      </h2>
      <p className="mb-4 max-w-[680px] text-sm text-[color:var(--text-secondary)]">
        {SystemPanelCopy.helperText}
      </p>
      <MetricsGrid controller={controller} />

      <h2 className="mb-3.5 text-base font-bold text-[color:var(--text-primary)]">
        {SystemPanelCopy.serviceLabel}
      </h2>
      <ServiceStatusGrid controller={controller} />

      <SystemLogsCard
        controller={controller}
        onUpdated={() => {
          setTick((value) => value + 1);
        }}
      />
    </section>
  );
};
