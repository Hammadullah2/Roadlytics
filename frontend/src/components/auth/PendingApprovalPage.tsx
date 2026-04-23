/** This component renders the pending approval screen for newly registered users. */
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAuthStore } from "@/store/authStore";

const PENDING_EMAIL_KEY = "road-quality-pending-email";
const PENDING_NAME_KEY = "road-quality-pending-name";
const REJECTED_MESSAGE = "Your account has been rejected. Contact admin.";

export const PendingApprovalPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const signOut = useAuthStore((state) => state.signOut);
  const { profile, isLoading: isProfileLoading, error, refetch } = useProfile({
    enabled: isAuthenticated,
  });
  const [statusMessage, setStatusMessage] = useState<string>("Waiting for admin approval...");
  const currentUser = profile ?? user;
  const email = currentUser?.email ?? window.localStorage.getItem(PENDING_EMAIL_KEY) ?? "No email available";
  const name = currentUser?.name ?? window.localStorage.getItem(PENDING_NAME_KEY) ?? "Pending user";
  const approvalStatus = currentUser?.approval_status;
  const isRejected = approvalStatus === "rejected";
  const hasStoredPendingIdentity = Boolean(window.localStorage.getItem(PENDING_EMAIL_KEY));

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const intervalID = window.setInterval(() => {
      void refetch().catch(() => undefined);
    }, 30000);

    return () => {
      window.clearInterval(intervalID);
    };
  }, [isAuthenticated, refetch]);

  useEffect(() => {
    if (approvalStatus === "approved") {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (approvalStatus === "rejected") {
      setStatusMessage(REJECTED_MESSAGE);
      return;
    }

    if (error) {
      setStatusMessage(error);
      return;
    }

    setStatusMessage("Waiting for admin approval...");
  }, [approvalStatus, error, navigate]);

  if (approvalStatus === "approved") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isAuthLoading && !isAuthenticated && !hasStoredPendingIdentity) {
    return <Navigate to="/login" replace />;
  }

  const handleSignOut = async (): Promise<void> => {
    window.localStorage.removeItem(PENDING_EMAIL_KEY);
    window.localStorage.removeItem(PENDING_NAME_KEY);
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <AuthShell
      title={isRejected ? "Access update" : "Approval pending"}
      subtitle={
        isRejected
          ? "An administrator reviewed your registration. Contact the admin team if you need this decision revisited."
          : "Your account has been created successfully and is waiting for an administrator to approve access."
      }
    >
      <div className="space-y-5">
        <div
          className={`flex items-center gap-3 rounded-[10px] px-5 py-4 text-sm ${
            isRejected
              ? "border border-red-500/30 bg-red-500/10 text-red-200"
              : "border border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {!isRejected ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300 [animation-delay:300ms]" />
            </div>
          ) : null}
          <span>{statusMessage}</span>
        </div>

        {(isAuthLoading || (isAuthenticated && isProfileLoading)) && !isRejected ? (
          <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-5 py-4 text-sm text-[color:var(--text-secondary)]">
            Checking your latest approval status...
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-5 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-nav-label)]">Registered Name</p>
            <p className="mt-2 break-words text-base font-medium text-[color:var(--text-primary)]">{name}</p>
          </div>

          <div className="min-w-0 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)] px-5 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--text-nav-label)]">Registered Email</p>
            <p className="mt-2 break-all text-base font-medium text-[color:var(--text-primary)]">{email}</p>
          </div>
        </div>

        <Button className="w-full" variant={isAuthenticated ? "secondary" : "primary"} onClick={() => void handleSignOut()}>
          Logout
        </Button>
      </div>
    </AuthShell>
  );
};
