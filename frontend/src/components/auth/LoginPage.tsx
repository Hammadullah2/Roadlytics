import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";

const REJECTED_MESSAGE = "Your account has been rejected. Contact admin.";

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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
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
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signOut = useAuthStore((state) => state.signOut);
  const setGuestMode = useAuthStore((state) => state.setGuestMode);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loginError = new URLSearchParams(location.search).get("error");
    if (loginError) setError(loginError);
  }, [location.search]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (user?.approval_status === "approved") { navigate("/dashboard", { replace: true }); return; }
    if (user?.approval_status === "pending") { navigate("/pending", { replace: true }); return; }
    if (user?.approval_status === "rejected") { void signOut(); setError(REJECTED_MESSAGE); }
  }, [isAuthenticated, isLoading, navigate, signOut, user?.approval_status]);

  if (!isLoading && isAuthenticated && user?.approval_status === "approved") {
    return <Navigate to="/dashboard" replace />;
  }
  if (!isLoading && isAuthenticated && user?.approval_status === "pending") {
    return <Navigate to="/pending" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setIsSubmitting(false);
    }
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
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25, pointerEvents: "none" }}>
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
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
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

          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 13, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
              {error}
            </div>
          )}

          <form className="stack" style={{ gap: 16 }} onSubmit={(e) => { void handleSubmit(e); }}>
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
                  required
                  autoComplete="email"
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
                  required
                  autoComplete="current-password"
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
              <a href="#" style={{ color: "var(--accent)", fontSize: 13, textDecoration: "none", fontWeight: 500 }} onClick={(e) => { e.preventDefault(); }}>
                Forgot Password?
              </a>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Log In"}
            </button>
          </form>

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, color: "var(--text-secondary)", fontSize: 12, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            or
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <button className="btn btn-secondary btn-block" type="button" disabled={isSubmitting} onClick={() => { void handleGoogleSignIn(); }}>
              <GoogleIcon />
              Sign in with Google
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={handleGuestEntry} disabled={isSubmitting}>
              Continue as Guest
            </button>
          </div>
        </div>

        <div className="muted" style={{ fontSize: 13 }}>
          Need an account? <Link to="/register" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Sign up here</Link>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>© 2026 Roadlytics. Secured with SSO.</div>
      </div>
    </div>
  );
};
