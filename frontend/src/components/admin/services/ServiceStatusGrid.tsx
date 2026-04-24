import { SystemMonitoringController } from "@/controllers/SystemMonitoringController";
import { ServiceHealthCard } from "@/components/admin/services/ServiceHealthCard";

type ServiceStatusGridProps = {
  controller: SystemMonitoringController;
};

export const ServiceStatusGrid = ({
  controller,
}: ServiceStatusGridProps): JSX.Element => {
  return (
    <div className="mb-6 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-3">
          {controller.getLeftColumnServices().map((service) => (
            <ServiceHealthCard key={service.id} service={service} />
          ))}
        </div>
        <div className="space-y-3">
          {controller.getRightColumnServices().map((service) => (
            <ServiceHealthCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </div>
  );
};
