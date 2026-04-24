import { ReportCard, type ReportCardData } from "@/components/reports/ReportCard";
import { ReportsEmptyState } from "@/components/reports/ReportsEmptyState";

type ReportsListProps = {
  cards: ReportCardData[];
  isLoading: boolean;
  error: string | null;
};

export const ReportsList = ({ cards, isLoading, error }: ReportsListProps): JSX.Element => {
  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-3">
        {["report-skeleton-1", "report-skeleton-2", "report-skeleton-3"].map((item) => (
          <div
            key={item}
            className="h-[84px] animate-pulse rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (cards.length === 0) {
    return <ReportsEmptyState />;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {cards.map((card, index) => (
        <ReportCard key={card.id} card={card} index={index} />
      ))}
    </div>
  );
};
