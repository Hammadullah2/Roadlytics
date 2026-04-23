import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useAuthStore } from "@/store/authStore";

type AppShellProps = {
  children: ReactNode;
};

const FullscreenLoading = ({ label }: { label: string }): JSX.Element => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-primary)] px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="h-14 w-14 animate-spin rounded-full border-4 border-[color:var(--border-subtle)] border-t-[color:var(--accent-green)]" />
        <p className="text-sm text-[color:var(--text-secondary)]">{label}</p>
      </div>
    </div>
  );
};

export const AppShell = ({ children }: AppShellProps): JSX.Element => {
  const navigate = useNavigate();
  const signOut = useAuthStore((state) => state.signOut);
  const { user, session, isLoading: isAuthLoading, isAuthenticated, guestMode } = useAuth();
  const { profile, isLoading: isProfileLoading, error } = useProfile({
    enabled: isAuthenticated && !guestMode,
  });
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);
  const currentUser = profile ?? user;
  const approvalStatus = currentUser?.approval_status;
  const redirectMessage =
    approvalStatus === "rejected" ? "Your account has been rejected. Contact admin." : "Unable to load your profile.";

  useEffect(() => {
    if (guestMode || isRedirecting || isAuthLoading || isProfileLoading) {
      return;
    }

    if (approvalStatus !== "rejected" && !(error && isAuthenticated && !currentUser?.id)) {
      return;
    }

    setIsRedirecting(true);

    void (async () => {
      await signOut();
      navigate(`/login?error=${encodeURIComponent(redirectMessage)}`, { replace: true });
    })();
  }, [
    approvalStatus,
    currentUser?.id,
    error,
    isAuthenticated,
    isAuthLoading,
    isProfileLoading,
    isRedirecting,
    guestMode,
    navigate,
    redirectMessage,
    signOut,
  ]);

  if (isAuthLoading || (isAuthenticated && !guestMode && isProfileLoading) || isRedirecting) {
    return <FullscreenLoading label="Checking your access..." />;
  }

  if (!guestMode && (!isAuthenticated || !session)) {
    return <Navigate to="/login" replace />;
  }

  if (guestMode) {
    return (
      <div className="min-h-screen bg-[color:var(--bg-primary)]">
        <Topbar />
        <Sidebar />
        <main className="ml-[210px] pt-[52px]">
          {children}
        </main>
      </div>
    );
  }

  if (approvalStatus === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (!currentUser?.id) {
    return <FullscreenLoading label="Loading your profile..." />;
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg-primary)]">
      <Topbar />
      <Sidebar />
      <main className="ml-[210px] pt-[52px]">
        {children}
      </main>
    </div>
  );
};
