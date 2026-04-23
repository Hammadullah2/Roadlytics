/** This component protects admin-only screens by redirecting non-admin users away from restricted pages. */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

type ApprovalGuardProps = {
  children: ReactNode;
};

const FullscreenLoading = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-emerald-500" />
        <p className="text-sm text-slate-400">Checking admin access...</p>
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
