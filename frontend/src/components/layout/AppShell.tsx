import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

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
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div className="spinner" />
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</p>
      </div>
    </div>
  );
};

const MAP_ROUTE_RE = /^\/projects\/(?!new$)[^/]+$|^\/map-analysis$/;

export const AppShell = ({ children }: AppShellProps): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const isMapRoute = MAP_ROUTE_RE.test(location.pathname);
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

  if (!guestMode && approvalStatus === "pending") {
    return <Navigate to="/pending" replace />;
  }

  if (!guestMode && !currentUser?.id) {
    return <FullscreenLoading label="Loading your profile..." />;
  }

  const isAdmin = currentUser?.role === "admin";
  const userName = currentUser?.name || currentUser?.email || (guestMode ? "Guest" : "User");
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="app">
      <Sidebar isAdmin={isAdmin} userName={userName} userInitials={userInitials} />
      <div className="main">
        <Topbar
          userName={userName}
          userInitials={userInitials}
          isAdmin={isAdmin}
          guestMode={guestMode}
        />
        <div className={`content${isMapRoute ? " no-padding" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
