import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

function RoadlyticsLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 8 4M20 20l-4-16M12 4v2M12 10v2M12 15v2M12 19v1"/>
    </svg>
  );
}

export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
      padding: "40px 16px",
    }}>
      {/* Topographic backdrop */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.45 }}
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        {Array.from({ length: 18 }).map((_, i) => {
          const y = 60 + i * 45;
          return (
            <path
              key={i}
              d={`M -50 ${y} Q 360 ${y - 18 + Math.sin(i) * 14} 720 ${y + Math.cos(i) * 8} T 1490 ${y - 6}`}
              stroke="#D4C9BD"
              fill="none"
              strokeWidth="1"
              opacity="0.7"
            />
          );
        })}
      </svg>

      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 440 }}>
        {/* Brand mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "var(--accent-subtle)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--accent)",
          }}>
            <RoadlyticsLogo />
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Roadlytics
          </span>
        </div>

        <div className="card" style={{ padding: 32, boxShadow: "var(--shadow-elev)" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 6px", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            {title}
          </h1>
          <div className="muted" style={{ fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            {subtitle}
          </div>
          {children}
        </div>

        <div className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 20 }}>
          © 2026 Roadlytics. Secured with SSO.
        </div>
      </div>
    </div>
  );
};
