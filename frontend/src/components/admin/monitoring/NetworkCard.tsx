import { NetworkMetric } from "@/models/NetworkMetric";

type NetworkCardProps = {
  metric: NetworkMetric;
};

export const NetworkCard = ({ metric }: NetworkCardProps): JSX.Element => {
  const Icon = metric.icon;

  return (
    <div className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <div className="flex items-center">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-[8px]"
          style={{ backgroundColor: `${metric.iconColor}26` }}
        >
          <Icon size={18} color={metric.iconColor} />
        </span>
        <span className="ml-2.5 text-[0.875rem] font-semibold text-[color:var(--text-primary)]">
          {metric.label}
        </span>
      </div>

      <div className="mt-3.5 flex items-center justify-between text-[0.8rem] text-[color:var(--text-secondary)]">
        <span>{metric.displayLabel}</span>
        <span>{metric.uploadLabel}</span>
      </div>

      <div className="mt-2 text-[0.875rem] font-semibold" style={{ color: metric.trafficColor }}>
        {metric.trafficLevel}
      </div>
    </div>
  );
};
