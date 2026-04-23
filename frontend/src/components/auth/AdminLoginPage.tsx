/** This component renders the credential-based admin access form used behind the entry screen. */
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
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
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const loginError = new URLSearchParams(location.search).get("error");

    setError(loginError);
  }, [location.search]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      return;
    }

    if (user?.approval_status === "approved") {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (user?.approval_status === "pending") {
      navigate("/pending", { replace: true });
      return;
    }

    if (user?.approval_status === "rejected") {
      void signOut();
      setError(REJECTED_MESSAGE);
    }
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

      if (profile.approval_status === "pending") {
        navigate("/pending", { replace: true });
        return;
      }

      if (profile.approval_status === "rejected") {
        await signOut();
        setError(REJECTED_MESSAGE);
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch (signInError: unknown) {
      if (signInError instanceof ApiClientError && signInError.status === 404) {
        await signOut();
      }

      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setError(null);
    setIsSubmitting(true);

    try {
      await signInWithGoogle();
    } catch (oauthError: unknown) {
      setError(oauthError instanceof Error ? oauthError.message : "Google sign-in failed.");
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Admin Login"
      subtitle="Use your approved platform account to continue into projects, maps, processing jobs, reports, and the admin panel."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-4 py-3 text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-4 py-3 text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
            placeholder="Enter your password"
            required
          />
        </div>

        {error ? (
          <p className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>

        <Button type="button" variant="secondary" className="w-full" disabled={isSubmitting} onClick={() => void handleGoogleSignIn()}>
          Sign in with Google
        </Button>
      </form>

      <div className="mt-6 space-y-3 text-center text-sm text-[color:var(--text-secondary)]">
        <p>
          Need an account?{" "}
          <Link to="/register" className="font-semibold text-[color:var(--accent-green-hover)] hover:text-[color:var(--accent-green)]">
            Register here
          </Link>
        </p>
        <p>
          Want the prototype entry screen?{" "}
          <Link to="/login" className="font-semibold text-[color:var(--accent-green-hover)] hover:text-[color:var(--accent-green)]">
            Back to access options
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};
