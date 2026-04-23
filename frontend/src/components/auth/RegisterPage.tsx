/** This component renders the registration screen and creates pending user accounts. */
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { ApiClientError, apiClient } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";
import type { BackendProfile } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";

const PENDING_EMAIL_KEY = "road-quality-pending-email";
const PENDING_NAME_KEY = "road-quality-pending-name";

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const loadSession = useAuthStore((state) => state.loadSession);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (user?.approval_status === "pending") {
      navigate("/pending", { replace: true });
      return;
    }

    if (user?.approval_status === "approved") {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate, user?.approval_status]);

  if (!isLoading && isAuthenticated && user?.approval_status === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (!isLoading && isAuthenticated && user?.approval_status === "approved") {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      window.localStorage.setItem(PENDING_EMAIL_KEY, email);
      window.localStorage.setItem(PENDING_NAME_KEY, name);

      if (data.session) {
        try {
          await apiClient.post<BackendProfile>("/auth/register", {
            name,
            email,
          });
        } catch (registrationError: unknown) {
          if (!(registrationError instanceof ApiClientError) || registrationError.status !== 409) {
            throw registrationError;
          }
        }

        await loadSession();
      }

      navigate("/pending", { replace: true });
    } catch (registrationError: unknown) {
      setError(registrationError instanceof Error ? registrationError.message : "Unable to create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Register for access to the rural Sindh road assessment platform. Accounts stay pending until an admin approves them."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
            Full name
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-4 py-3 text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
            placeholder="Enter your full name"
            required
          />
        </div>

        <div>
          <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-4 py-3 text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-4 py-3 text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
            placeholder="Choose a password"
            required
          />
        </div>

        {error ? (
          <p className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Register"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[color:var(--text-secondary)]">
        Already registered?{" "}
        <Link to="/login" className="font-semibold text-[color:var(--accent-green-hover)] hover:text-[color:var(--accent-green)]">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
};
