import { SystemMonitoringController } from "@/controllers/SystemMonitoringController";
import { MetricCard } from "@/components/admin/monitoring/MetricCard";
import { NetworkCard } from "@/components/admin/monitoring/NetworkCard";

type MetricsGridProps = {
  controller: SystemMonitoringController;
};

export const MetricsGrid = ({ controller }: MetricsGridProps): JSX.Element => {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4">
      <MetricCard metric={controller.getCpuMetric()} />
      <MetricCard metric={controller.getMemoryMetric()} />
      <MetricCard metric={controller.getStorageMetric()} />
      <NetworkCard metric={controller.getNetworkMetric()} />
    </div>
  );
};
