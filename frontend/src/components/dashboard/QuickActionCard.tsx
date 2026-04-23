import { useNavigate } from "react-router-dom";

import { QuickAction } from "@/models/QuickAction";

type QuickActionCardProps = {
  action: QuickAction;
  onActionClick?: (action: QuickAction) => boolean;
};

export const QuickActionCard = ({
  action,
  onActionClick,
}: QuickActionCardProps): JSX.Element => {
  const navigate = useNavigate();
  const Icon = action.icon;
  const primary = action.isPrimary();
  const cardClassName = primary
    ? "bg-[color:var(--accent-green)] text-white hover:bg-[color:var(--accent-green-hover)]"
    : "bg-[color:var(--bg-card)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-card-hover)]";
  const iconContainerClassName = primary
    ? "bg-white/20"
    : "bg-[color:var(--accent-green)]";

  return (
    <button
      type="button"
      onClick={() => {
        if (onActionClick) {
          const handled = onActionClick(action);
          if (handled) {
            return;
          }
        }

        navigate(action.route);
      }}
      className={`flex w-full items-center gap-4 rounded-[12px] px-6 py-4 text-left transition-colors duration-150 ${cardClassName}`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${iconContainerClassName}`}>
        <Icon size={20} color="white" />
      </span>
      <span className={`text-base ${primary ? "font-bold" : "font-medium"}`}>
        {action.label}
      </span>
    </button>
  );
};
