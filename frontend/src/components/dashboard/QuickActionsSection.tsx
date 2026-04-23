import { QuickActionRegistry } from "@/config/QuickActionRegistry";
import { QuickActionCard } from "@/components/dashboard/QuickActionCard";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { QuickAction } from "@/models/QuickAction";

class QuickActionsCopy {
  public static readonly title = "Quick Actions";
}

type QuickActionsSectionProps = {
  onActionClick: (action: QuickAction) => boolean;
};

export const QuickActionsSection = ({
  onActionClick,
}: QuickActionsSectionProps): JSX.Element => {
  const actions = QuickActionRegistry.getAll();

  return (
    <section>
      <SectionHeading title={QuickActionsCopy.title} />

      <div className="flex max-w-[720px] flex-col gap-3">
        {actions.map((action) => (
          <QuickActionCard
            key={action.id}
            action={action}
            onActionClick={onActionClick}
          />
        ))}
      </div>
    </section>
  );
};
