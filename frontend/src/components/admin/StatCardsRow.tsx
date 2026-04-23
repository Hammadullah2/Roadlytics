import { AdminPanelController } from "@/controllers/AdminPanelController";
import { StatCardItem } from "@/components/admin/StatCardItem";

type StatCardsRowProps = {
  controller: AdminPanelController;
};

export const StatCardsRow = ({
  controller,
}: StatCardsRowProps): JSX.Element => {
  return (
    <div className="mb-7 grid grid-cols-4 gap-4">
      {controller.getStatCards().map((card) => (
        <StatCardItem key={card.id} card={card} />
      ))}
    </div>
  );
};
