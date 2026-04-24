import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

function EyeIcon({ off = false }: { off?: boolean }) {
  if (off) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function RoadlyticsLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20 8 4M20 20l-4-16M12 4v2M12 10v2M12 15v2M12 19v1"/>
    </svg>
  );
}

export const LoginPage = (): JSX.Element => {
  const navigate = useNavigate();
  const setGuestMode = useAuthStore((state) => state.setGuestMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = (): void => {
    navigate("/login/admin");
  };

  const handleGuestEntry = (): void => {
    setGuestMode(true);
    navigate("/dashboard");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Topographic backdrop */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.55 }}
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        {Array.from({ length: 22 }).map((_, i) => {
          const y = 40 + i * 40;
          return (
            <path
              key={i}
              d={`M -50 ${y} Q 360 ${y - 20 + Math.sin(i) * 18} 720 ${y + Math.cos(i) * 10} T 1490 ${y - 8}`}
              stroke="#D4C9BD"
              fill="none"
              strokeWidth="1"
              opacity="0.7"
            />
          );
        })}
      </svg>

      {/* Grid overlay */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25, pointerEvents: "none" }}
      >
        <defs>
          <pattern id="gp" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#D4C9BD" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#gp)"/>
      </svg>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        {/* Brand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: "var(--accent-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--accent)",
            }}>
              <RoadlyticsLogo />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
              Roadlytics
            </h1>
          </div>
          <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--text-secondary)" }}>
            AI-Powered Road Infrastructure Intelligence
          </div>
        </div>

        {/* Login card */}
        <div className="card" style={{ width: 420, padding: 32, boxShadow: "var(--shadow-elev)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            Welcome Back
          </h2>
          <div className="muted" style={{ marginBottom: 22, fontSize: 13 }}>
            Sign in to access your workspace.
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <div className="input-wrap">
                <MailIcon />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); }}
                  placeholder="you@organization.io"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="input-wrap">
                <LockIcon />
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  className="with-trailing"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); }}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  className="trailing"
                  onClick={() => { setShowPass((v) => !v); }}
                >
                  <EyeIcon off={showPass} />
                </button>
              </div>
            </div>

            <div className="row space-between" style={{ marginTop: 4 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} />
                Remember me
              </label>
              <a
                href="#"
                style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none", fontWeight: 500 }}
                onClick={(e) => { e.preventDefault(); }}
              >
                Forgot Password?
              </a>
            </div>

            <button className="btn btn-primary btn-block" type="button" onClick={handleLogin}>
              Log In
            </button>

            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, color: "var(--text-secondary)", fontSize: 12, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              or
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            <button className="btn btn-secondary btn-block" type="button" onClick={handleGuestEntry}>
              Continue as Guest
            </button>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Need an account? <a href="/register" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Sign up here</a>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>© 2026 Roadlytics. Secured with SSO.</div>
      </div>
    </div>
  );
};
