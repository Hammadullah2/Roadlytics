import { useNavigate } from "react-router-dom";

export type ProjectCardData = {
  id: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
  displayDate: string;
  route: string;
};

type ProjectCardProps = {
  card: ProjectCardData;
  index: number;
};

function MapPinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
    </svg>
  );
}

function statusPill(label: string): JSX.Element {
  const lower = label.toLowerCase();
  if (lower === "completed") {
    return <span className="pill pill-success"><span className="dot" />Completed</span>;
  }
  if (lower === "in progress") {
    return <span className="pill pill-warning"><span className="dot" />In Progress</span>;
  }
  if (lower === "failed") {
    return <span className="pill pill-danger"><span className="dot" />Failed</span>;
  }
  return <span className="pill pill-info"><span className="dot" />New</span>;
}

function MapThumb() {
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="400" height="160" fill="#efe6d6"/>
      {/* grid */}
      <defs>
        <pattern id="thumb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(122,110,98,0.08)" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="400" height="160" fill="url(#thumb-grid)"/>
      {/* AOI boundary */}
      <rect x="60" y="30" width="280" height="100" fill="none" stroke="#B8763E" strokeWidth="1.5" strokeDasharray="6 3" rx="2"/>
      {/* Simple road lines */}
      <line x1="80" y1="80" x2="320" y2="80" stroke="#5B8C5A" strokeWidth="2.5"/>
      <line x1="200" y1="40" x2="200" y2="120" stroke="#5B8C5A" strokeWidth="2"/>
      <line x1="80" y1="60" x2="180" y2="80" stroke="#D4A843" strokeWidth="2"/>
      <line x1="220" y1="80" x2="320" y2="50" stroke="#C25B4E" strokeWidth="2"/>
    </svg>
  );
}

export const ProjectCard = ({ card, index }: ProjectCardProps): JSX.Element => {
  const navigate = useNavigate();

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "transform 0.15s, box-shadow 0.15s",
        animation: `fadeSlideUp 250ms ease-out forwards`,
        animationDelay: `${index * 60}ms`,
        opacity: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-elev)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
    >
      {/* Map thumbnail */}
      <div style={{ height: 160, background: "#efe6d6", borderBottom: "1px solid var(--border)", position: "relative" }}>
        <MapThumb />
        <div style={{ position: "absolute", top: 10, right: 10 }}>
          {statusPill(card.statusLabel)}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{card.title}</div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill pill-neutral" style={{ gap: 4 }}>
            <MapPinIcon />
            {card.subtitle}
          </span>
        </div>

        <div className="muted" style={{ fontSize: 12 }}>Created: {card.displayDate}</div>

        <div className="row space-between" style={{ marginTop: 4 }}>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => { navigate(card.route); }}
          >
            Open
            <ChevronRightIcon />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: "6px 8px" }}
            type="button"
          >
            <MoreIcon />
          </button>
        </div>
      </div>
    </div>
  );
};
