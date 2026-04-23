import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AdminPanelController } from "@/controllers/AdminPanelController";
import { useAuthStore } from "@/store/authStore";

type AdminTopbarProps = {
  controller: AdminPanelController;
};

class AdminTopbarCopy {
  public static readonly backLabel = "Back to Dashboard";
  public static readonly title = "Admin Panel";
  public static readonly logoutLabel = "Logout";
}

export const AdminTopbar = ({
  controller,
}: AdminTopbarProps): JSX.Element => {
  const navigate = useNavigate();
  const signOut = useAuthStore((state) => state.signOut);
  const activeView = controller.getActiveView();

  return (
    <header className="shrink-0 bg-[color:var(--bg-secondary)]">
      <div className="flex h-[52px] items-center justify-between border-b border-[color:var(--border-subtle)] px-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-[0.85rem] text-[color:var(--text-secondary)] transition-colors duration-150 hover:text-white"
          >
            <ChevronLeft size={14} />
            <span>{AdminTopbarCopy.backLabel}</span>
          </button>
          <div className="h-5 w-px bg-[color:var(--border-subtle)]" />
          <span className="text-[1rem] font-bold text-[color:var(--text-primary)]">
            {AdminTopbarCopy.title}
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            void (async () => {
              await signOut();
              navigate("/login", { replace: true });
            })();
          }}
          className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] px-4 py-1.5 text-[0.875rem] text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--border-subtle)]"
        >
          {AdminTopbarCopy.logoutLabel}
        </button>
      </div>

      <div className="flex h-[52px] items-center gap-2 border-b border-[color:var(--border-subtle)] px-6">
        {controller.getTabs().map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => controller.setActiveView(tab.panel)}
            className={`rounded-[8px] px-4 py-[0.4rem] text-[0.875rem] transition-colors duration-150 ${
              tab.isActive(activeView)
                ? "bg-[color:var(--accent-green)] font-semibold text-white"
                : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] text-[color:var(--text-secondary)] hover:bg-[color:var(--border-subtle)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
};
