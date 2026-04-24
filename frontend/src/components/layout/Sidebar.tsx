import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";

const STATIC_NAV = [
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon, path: "/dashboard" },
  { id: "projects", label: "Projects", icon: FolderIcon, path: "/projects" },
  { id: "processing", label: "Processing", icon: CpuIcon, path: "/processing" },
  { id: "reports", label: "Reports", icon: FileTextIcon, path: "/reports" },
];

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function RoadlyticsLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 8 4M20 20l-4-16M12 4v2M12 10v2M12 15v2M12 19v1"/>
    </svg>
  );
}

type SidebarProps = {
  isAdmin?: boolean;
  userName?: string;
  userInitials?: string;
};

function isPathActive(currentPath: string, navPath: string): boolean {
  if (navPath === "/dashboard") return currentPath === "/dashboard" || currentPath === "/";
  if (navPath === "/projects") return currentPath === "/projects" || currentPath === "/projects/new";
  if (navPath.startsWith("/projects/")) return currentPath.startsWith("/projects/") && currentPath !== "/projects" && currentPath !== "/projects/new";
  return currentPath.startsWith(navPath);
}

export const Sidebar = ({ isAdmin = false, userName, userInitials }: SidebarProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = useAuthStore((state) => state.signOut);
  const guestMode = useAuthStore((state) => state.guestMode);
  const setGuestMode = useAuthStore((state) => state.setGuestMode);
  const { projects } = useProjects();

  const lastProjectId = projects.length > 0
    ? [...projects].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].id
    : null;
  const mapAnalysisPath = lastProjectId ? `/projects/${lastProjectId}` : "/map-analysis";

  const handleLogout = (): void => {
    void (async () => {
      if (guestMode) {
        setGuestMode(false);
      } else {
        await signOut();
      }
      navigate("/login", { replace: true });
    })();
  };

  const isAdminActive = location.pathname.startsWith("/admin");
  const isMapAnalysisActive = isPathActive(location.pathname, "/projects/");

  const navItems = [
    ...STATIC_NAV.slice(0, 2),
    { id: "map-analysis", label: "Map Analysis", icon: MapIcon, path: mapAnalysisPath },
    ...STATIC_NAV.slice(2),
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <RoadlyticsLogo />
        </div>
        <div className="brand-name">Roadlytics</div>
      </div>

      <div className="nav-section">
        <div className="nav-label">Workspace</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === "map-analysis"
            ? isMapAnalysisActive
            : isPathActive(location.pathname, item.path);
          return (
            <button
              key={item.id}
              className={`nav-item ${active ? "active" : ""}`}
              onClick={() => { navigate(item.path); }}
              type="button"
            >
              <Icon />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        {isAdmin && (
          <button
            className={`nav-item ${isAdminActive ? "active" : ""}`}
            onClick={() => { navigate("/admin"); }}
            type="button"
            style={{ marginBottom: 4 }}
          >
            <ShieldIcon />
            Admin Panel
          </button>
        )}

        <div className="user-row">
          <div className="avatar">
            {guestMode ? "G" : (userInitials ?? "U")}
          </div>
          <div className="user-info">
            <div className="name">{guestMode ? "Guest" : (userName ?? "User")}</div>
            <div className="role">{isAdmin ? "Admin" : "Analyst"}</div>
          </div>
        </div>

        <button
          className="nav-item"
          style={{ padding: "8px 12px", fontSize: 13, color: "var(--text-secondary)" }}
          onClick={handleLogout}
          type="button"
        >
          <LogOutIcon />
          {guestMode ? "Exit Guest" : "Logout"}
        </button>
      </div>
    </aside>
  );
};
