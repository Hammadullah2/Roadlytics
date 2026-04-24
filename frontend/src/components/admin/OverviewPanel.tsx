import { AdminPanelController } from "@/controllers/AdminPanelController";
import { QuickActionsGrid } from "@/components/admin/QuickActionsGrid";
import { RecentActivityCard } from "@/components/admin/RecentActivityCard";
import { StatCardsRow } from "@/components/admin/StatCardsRow";
import { SystemStatusCard } from "@/components/admin/SystemStatusCard";

type OverviewPanelProps = {
  controller: AdminPanelController;
};

export const OverviewPanel = ({
  controller,
}: OverviewPanelProps): JSX.Element => {
  if (controller.isLoading) {
    return (
      <section className="rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5 text-[0.95rem] text-[color:var(--text-secondary)]">
        Loading admin overview...
      </section>
    );
  }

  if (controller.errorMessage) {
    return (
      <section className="rounded-[14px] border border-[#f85149]/30 bg-[#f85149]/10 px-6 py-5 text-[0.95rem] text-[#fda4af]">
        {controller.errorMessage}
      </section>
    );
  }

  return (
    <section className="w-full">
      <StatCardsRow controller={controller} />
      <SystemStatusCard controller={controller} />
      <RecentActivityCard controller={controller} />
      <QuickActionsGrid controller={controller} />
    </section>
  );
};
