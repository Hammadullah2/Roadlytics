/** Protects admin-only screens by redirecting non-admin users. */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

type ApprovalGuardProps = {
  children: ReactNode;
};

const FullscreenLoading = () => {
  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div className="spinner" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Checking admin access…</p>
      </div>
    </div>
  );
};

export const ApprovalGuard = ({ children }: ApprovalGuardProps) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const currentUser = profile ?? user;

  if (isAuthLoading || isProfileLoading) {
    return <FullscreenLoading />;
  }

  if (currentUser?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
