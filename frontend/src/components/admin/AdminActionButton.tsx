import { AdminQuickAction } from "@/models/AdminQuickAction";

type AdminActionButtonProps = {
  action: AdminQuickAction;
  onClick: () => void;
};

export const AdminActionButton = ({
  action,
  onClick,
}: AdminActionButtonProps): JSX.Element => {
  const Icon = action.icon;
  const borderedClassName = action.isPrimary()
    ? "border border-transparent"
    : "border border-[color:var(--border-subtle)]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[72px] w-full items-center gap-4 rounded-[14px] px-6 py-5 text-left transition-colors duration-150 ${borderedClassName}`}
      style={{ backgroundColor: action.bgColor }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = action.hoverColor;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = action.bgColor;
      }}
    >
      <Icon size={22} color="white" />
      <span className="text-[1rem] font-semibold text-white">
        {action.label}
      </span>
    </button>
  );
};
