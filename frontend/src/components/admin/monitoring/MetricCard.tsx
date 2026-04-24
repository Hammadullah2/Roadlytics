import { SystemMetric } from "@/models/SystemMetric";

type MetricCardProps = {
  metric: SystemMetric;
};

export const MetricCard = ({ metric }: MetricCardProps): JSX.Element => {
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

      <div className="mt-3.5 flex items-center justify-between">
        <span className="text-[0.8rem] text-[color:var(--text-secondary)]">
          {metric.displayLabel}
        </span>
        <span className="text-[0.875rem] font-semibold text-[color:var(--text-primary)]">
          {metric.displayValue}
        </span>
      </div>

      <div className="mt-2 h-2 w-full rounded-full bg-[color:var(--border-subtle)]">
        <div
          className="h-2 rounded-full transition-[width] duration-[600ms] ease-in-out"
          style={{ width: `${metric.percentage}%`, backgroundColor: metric.barColor }}
        />
      </div>
    </div>
  );
};
