import { AdminPanelController } from "@/controllers/AdminPanelController";
import { AdminActionButton } from "@/components/admin/AdminActionButton";

type QuickActionsGridProps = {
  controller: AdminPanelController;
};

class QuickActionsGridCopy {
  public static readonly title = "Quick Actions";
}

export const QuickActionsGrid = ({
  controller,
}: QuickActionsGridProps): JSX.Element => {
  return (
    <section className="mt-7 w-full">
      <h2 className="mb-3.5 text-[1.1rem] font-bold text-[color:var(--text-primary)]">
        {QuickActionsGridCopy.title}
      </h2>

      <div className="grid w-full grid-cols-3 gap-4">
        {controller.getQuickActions().map((action) => (
          <AdminActionButton
            key={action.id}
            action={action}
            onClick={() => controller.handleQuickAction(action.action)}
          />
        ))}
      </div>
    </section>
  );
};
