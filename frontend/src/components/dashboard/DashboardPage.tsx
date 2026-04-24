import { useNavigate } from "react-router-dom";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useReportRecords } from "@/hooks/useReportRecords";
import { useAuthStore } from "@/store/authStore";

function MapPinPlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21C12 21 5 13.5 5 8a7 7 0 0 1 14 0c0 5.5-7 13-7 13z"/><circle cx="12" cy="8" r="2"/>
      <line x1="12" y1="2" x2="12" y2="6" strokeWidth="1.5"/><line x1="12" y1="10" x2="12" y2="14" strokeWidth="1.5"/>
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      <polyline points="2 10 12 10 22 10"/>
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
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

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function NavArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function getStatusPill(status: string): JSX.Element {
  if (status === "completed") {
    return (
      <span className="pill pill-success">
        <span className="dot" />Completed
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="pill pill-warning">
        <span className="dot" />Running
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="pill pill-danger">
        <span className="dot" />Failed
      </span>
    );
  }
  return (
    <span className="pill pill-neutral">
      <span className="dot" />Pending
    </span>
  );
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const DashboardPage = (): JSX.Element => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const guestMode = useAuthStore((state) => state.guestMode);
  const { projects } = useProjects();
  const { jobs, records: jobRecords } = useJobRecords();
  const { reports } = useReportRecords();

  const firstName = guestMode ? "there" : (user?.name?.split(" ")[0] || "there");

  const pendingJobs = (jobs ?? []).filter((j) => j.status === "pending" || j.status === "running").length;
  const completedJobs = (jobs ?? []).filter((j) => j.status === "completed").length;
  const failedJobs = (jobs ?? []).filter((j) => j.status === "failed").length;

  const stats = [
    { label: "Total Projects", num: projects.length, icon: <FolderIcon />, color: "var(--info)" },
    { label: "Pending Jobs", num: pendingJobs, icon: <ClockIcon />, color: "var(--warning)" },
    { label: "Completed Jobs", num: completedJobs, icon: <CheckCircleIcon />, color: "var(--success)" },
    { label: "Failed Jobs", num: failedJobs, icon: <AlertTriangleIcon />, color: "var(--danger)" },
  ];

  const quickActions = [
    {
      icon: <MapPinPlusIcon />,
      title: "New Assessment",
      desc: "Select a region on the map and run the AI pipeline.",
      cta: "Open Map",
      target: "/map-analysis",
    },
    {
      icon: <FolderOpenIcon />,
      title: "View Projects",
      desc: "Browse and manage your assessment projects.",
      cta: "Browse",
      target: "/projects",
    },
    {
      icon: <FileTextIcon />,
      title: "View Reports",
      desc: "Download completed assessment reports.",
      cta: "Browse",
      target: "/reports",
    },
  ];

  const recentJobs = [...(jobRecords ?? [])]
    .sort((a, b) => new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime())
    .slice(0, 5);

  return (
    <div>
      {/* Header */}
      <div className="row space-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Good morning, {firstName}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            Here's what's happening in your workspace today.
          </div>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { navigate("/map-analysis"); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21C12 21 5 13.5 5 8a7 7 0 0 1 14 0c0 5.5-7 13-7 13z"/>
            <line x1="12" y1="5" x2="12" y2="11"/><line x1="9" y1="8" x2="15" y2="8"/>
          </svg>
          New Assessment
        </button>
      </div>

      {/* Quick Actions */}
      <div className="section-label">Quick Actions</div>
      <div className="rl-grid rl-grid-3" style={{ marginBottom: 32 }}>
        {quickActions.map((action) => (
          <div
            key={action.title}
            className="card card-pad"
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--accent-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)",
            }}>
              {action.icon}
            </div>
            <div>
              <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{action.title}</h4>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{action.desc}</div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              type="button"
              onClick={() => { navigate(action.target); }}
            >
              {action.cta}
              <NavArrow />
            </button>
          </div>
        ))}
      </div>

      {/* Status Overview */}
      <div className="section-label">Status Overview</div>
      <div className="rl-grid rl-grid-4" style={{ marginBottom: 32 }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="card card-pad"
            style={{ borderLeft: `4px solid ${stat.color}`, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div className="row space-between">
              <span className="muted" style={{ fontSize: 13 }}>{stat.label}</span>
              <div style={{ color: stat.color }}>{stat.icon}</div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em" }}>{stat.num}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="section-label">Recent Activity</div>
      <div className="card" style={{ overflow: "hidden" }}>
        {recentJobs.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
            No recent jobs. <button className="btn btn-ghost btn-sm" type="button" onClick={() => { navigate("/map-analysis"); }}>Start a new assessment</button>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Region</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((record) => (
                <tr key={record.job.id}>
                  <td className="mono" style={{ color: "var(--text-secondary)" }}>
                    {record.job.id.slice(0, 12).toUpperCase()}
                  </td>
                  <td style={{ fontWeight: 500 }}>{record.region?.name ?? record.project?.name ?? "—"}</td>
                  <td>{getStatusPill(record.job.status)}</td>
                  <td className="muted">{formatDate(record.job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
