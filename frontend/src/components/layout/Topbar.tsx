import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/authStore";

class TopbarCopy {
  public static readonly title = "Road Assessment Platform";
  public static readonly logoutLabel = "Logout";
}

export const Topbar = (): JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const guestMode = useAuthStore((state) => state.guestMode);
  const setGuestMode = useAuthStore((state) => state.setGuestMode);
  const signOut = useAuthStore((state) => state.signOut);

  const userLabel = guestMode ? "Guest Mode" : user?.name || user?.email || "Authenticated User";

  const handleLogout = async (): Promise<void> => {
    if (guestMode) {
      setGuestMode(false);
      navigate("/login", { replace: true });
      return;
    }

    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-[52px] items-center justify-between border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-6">
      <span className="text-sm font-bold text-white">
        {TopbarCopy.title}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex max-w-[320px] items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:text-[color:var(--text-primary)]"
        >
          <User size={16} />
          <span className="truncate">{userLabel}</span>
        </button>

        <div className="mx-1 h-6 w-px bg-[color:var(--border-subtle)]" />

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:text-[color:var(--text-primary)]"
        >
          <LogOut size={16} />
          <span>{guestMode ? "Exit" : TopbarCopy.logoutLabel}</span>
        </button>
      </div>
    </header>
  );
};
