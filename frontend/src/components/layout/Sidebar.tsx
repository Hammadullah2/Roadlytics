import { useLocation } from "react-router-dom";

import { NavigationConfig } from "@/config/NavigationConfig";
import { NavItem } from "@/components/shared/NavItem";
import { useAuthStore } from "@/store/authStore";

class SidebarCopy {
  public static readonly navigationLabel = "NAVIGATION";
}

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export const Sidebar = (_props: SidebarProps): JSX.Element => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const mainItems = NavigationConfig.getMainItems();
  const adminItems = user?.role === "admin" ? NavigationConfig.getAdminItems() : [];

  return (
    <aside className="fixed left-0 top-[52px] flex h-[calc(100vh-52px)] w-[210px] flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]">
      <div className="flex-1 px-4 py-6">
        <p className="mb-4 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-nav-label)]">
          {SidebarCopy.navigationLabel}
        </p>

        <nav className="space-y-2">
          {mainItems.map((item) => (
            <NavItem key={item.id} item={item} currentRoute={location.pathname} />
          ))}
        </nav>
      </div>

      {adminItems.length > 0 ? (
        <div className="border-t border-[color:var(--border-subtle)] px-4 py-4">
          <nav className="space-y-2">
            {adminItems.map((item) => (
              <NavItem key={item.id} item={item} currentRoute={location.pathname} />
            ))}
          </nav>
        </div>
      ) : null}
    </aside>
  );
};
