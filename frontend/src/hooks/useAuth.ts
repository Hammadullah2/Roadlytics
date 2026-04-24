import { useEffect } from "react";

import { useAuthStore } from "@/store/authStore";

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const guestMode = useAuthStore((state) => state.guestMode);
  const loadSession = useAuthStore((state) => state.loadSession);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return {
    user,
    session,
    isLoading,
    isAuthenticated,
    guestMode,
  };
};
