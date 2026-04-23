import { TrendingUp } from "lucide-react";

import { StatCard } from "@/models/StatCard";

type StatCardItemProps = {
  card: StatCard;
};

export const StatCardItem = ({ card }: StatCardItemProps): JSX.Element => {
  const Icon = card.icon;
  const showTrendIcon = card.trendType === "up";

  return (
    <div className="flex h-full flex-col rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-[52px] w-[52px] items-center justify-center rounded-[12px]"
          style={{ backgroundColor: card.iconBg }}
        >
          <Icon size={24} color="white" />
        </span>
        <span className="text-[0.85rem] font-medium leading-[1.3] text-[color:var(--text-secondary)]">
          {card.label}
        </span>
      </div>

      <div className="mt-3 text-[2rem] font-bold text-[color:var(--text-primary)]">
        {card.value}
      </div>

      {card.hasTrend ? (
        <div className="mt-1 flex items-center gap-1.5 text-[0.8rem]" style={{ color: card.trendColor }}>
          {showTrendIcon ? <TrendingUp size={13} /> : null}
          <span>{card.trend}</span>
        </div>
      ) : null}
    </div>
  );
};
