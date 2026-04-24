import { ServiceHealth } from "@/models/ServiceHealth";

type ServiceHealthCardProps = {
  service: ServiceHealth;
};

export const ServiceHealthCard = ({
  service,
}: ServiceHealthCardProps): JSX.Element => {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: service.dotColor }}
        />
        <span className="text-[0.875rem] font-medium text-[color:var(--text-primary)]">
          {service.name}
        </span>
      </div>

      <div className="flex flex-col items-end">
        <span className="text-[0.8rem] font-semibold" style={{ color: service.statusTextColor }}>
          {service.statusLabel}
        </span>
        <span className="text-[0.72rem] text-[color:var(--text-nav-label)]">
          {service.uptimeLabel}
        </span>
      </div>
    </div>
  );
};
