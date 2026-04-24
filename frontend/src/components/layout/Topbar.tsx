import { useLocation } from "react-router-dom";

type TopbarProps = {
  userName?: string;
  userInitials?: string;
  isAdmin?: boolean;
  guestMode?: boolean;
};

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function buildBreadcrumbs(pathname: string): string[] {
  if (pathname === "/" || pathname === "/dashboard") return ["Dashboard"];
  if (pathname.startsWith("/projects/") && pathname !== "/projects") return ["Projects", "Project Detail"];
  if (pathname === "/projects") return ["Projects"];
  if (pathname === "/map-analysis") return ["Map Analysis"];
  if (pathname === "/processing") return ["Processing"];
  if (pathname.startsWith("/reports/") && pathname !== "/reports") return ["Reports", "Report Viewer"];
  if (pathname === "/reports") return ["Reports"];
  if (pathname === "/admin") return ["Admin Panel"];
  if (pathname === "/upload") return ["Upload"];
  return [pathname.replace("/", "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())];
}

export const Topbar = ({ userName, isAdmin = false, guestMode = false }: TopbarProps): JSX.Element => {
  const location = useLocation();
  const crumbs = buildBreadcrumbs(location.pathname);
  const displayName = userName?.split(" ")[0] || (guestMode ? "Guest" : "User");

  return (
    <div className="topbar">
      <div className="breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <ChevronRight />}
            <span className={i === crumbs.length - 1 ? "current" : ""}>{crumb}</span>
          </span>
        ))}
      </div>

      <div className="topbar-right">
        <button className="bell" type="button" aria-label="Notifications">
          <BellIcon />
          <span className="dot" />
        </button>
        <span className="greeting">Hello, {displayName}</span>
        <span className="mode-pill">{isAdmin && !guestMode ? "Admin Mode" : guestMode ? "Guest Mode" : "Analyst Mode"}</span>
      </div>
    </div>
  );
};
