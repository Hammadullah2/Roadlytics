import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { useAuth } from "@/hooks/useAuth";
import { ApiClientError, apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import type { BackendProfile } from "@/types";
import { normalizeProfile } from "@/types";

const REJECTED_MESSAGE = "Your account has been rejected. Contact admin.";

export const AdminLoginPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const signIn = useAuthStore((state) => state.signIn);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const signOut = useAuthStore((state) => state.signOut);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loginError = new URLSearchParams(location.search).get("error");
    setError(loginError);
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
      const backendProfile = await apiClient.get<BackendProfile>("/auth/profile");
      const profile = normalizeProfile(backendProfile);
      useAuthStore.setState({ user: profile, isAuthenticated: true });
      if (profile.approval_status === "pending") { navigate("/pending", { replace: true }); return; }
      if (profile.approval_status === "rejected") { await signOut(); setError(REJECTED_MESSAGE); return; }
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 404) await signOut();
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

  return (
    <AuthShell
      title="Sign In"
      subtitle="Use your approved platform account to access the workspace."
    >
      <form className="stack" style={{ gap: 16 }} onSubmit={(e) => { void handleSubmit(e); }}>
        <div className="field">
          <label htmlFor="al-email">Email</label>
          <input
            id="al-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); }}
            placeholder="you@organization.io"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="al-password">Password</label>
          <input
            id="al-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); }}
            placeholder="Enter your password"
            required
          />
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 13, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>

        <button
          className="btn btn-secondary btn-block"
          type="button"
          disabled={isSubmitting}
          onClick={() => { void handleGoogleSignIn(); }}
        >
          Sign in with Google
        </button>
      </form>

      <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        <p style={{ marginBottom: 8 }}>
          Need an account?{" "}
          <Link to="/register" style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
            Register here
          </Link>
        </p>
        <p>
          <Link to="/login" style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
            ← Back to access options
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};
