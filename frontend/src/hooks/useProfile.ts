import { useEffect, useState } from "react";

import { ApiClientError, apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import type { BackendProfile, Profile } from "@/types";
import { normalizeProfile } from "@/types";

type UseProfileOptions = {
  enabled?: boolean;
};

type UseProfileResult = {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<Profile | null>;
  updateProfile: (name: string) => Promise<Profile>;
};

export const useProfile = (options: UseProfileOptions = {}): UseProfileResult => {
  const enabled = options.enabled ?? true;
  const session = useAuthStore((state) => state.session);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [profile, setProfile] = useState<Profile | null>(user);
  const [isLoading, setIsLoading] = useState<boolean>(enabled && isAuthenticated);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(user);
  }, [user]);

  const loadProfile = async (): Promise<Profile | null> => {
    if (!enabled || !isAuthenticated || !session) {
      setProfile(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);

    try {
      const backendProfile = await apiClient.get<BackendProfile>("/auth/profile");
      const normalizedProfile = normalizeProfile(backendProfile);

      setProfile(normalizedProfile);
      setError(null);
      useAuthStore.setState({ user: normalizedProfile });

      return normalizedProfile;
    } catch (profileError: unknown) {
      if (profileError instanceof ApiClientError && profileError.status === 404) {
        setProfile(null);
        setError("Profile not found.");
        useAuthStore.setState({ user: null });
        return null;
      }

      setError(profileError instanceof Error ? profileError.message : "Failed to load profile.");
      throw profileError;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncProfile = async (): Promise<void> => {
      try {
        const nextProfile = await loadProfile();

        if (!isMounted) {
          return;
        }

        setProfile(nextProfile);
      } catch {
        if (!isMounted) {
          return;
        }
      }
    };

    void syncProfile();

    return () => {
      isMounted = false;
    };
  }, [enabled, isAuthenticated, session?.access_token]);

  const refetch = async (): Promise<Profile | null> => {
    return loadProfile();
  };

  const updateProfile = async (name: string): Promise<Profile> => {
    const backendProfile = await apiClient.patch<BackendProfile>("/auth/profile", { name });
    const normalizedProfile = normalizeProfile(backendProfile);

    setProfile(normalizedProfile);
    setError(null);
    useAuthStore.setState({ user: normalizedProfile });

    return normalizedProfile;
  };

  return {
    profile,
    isLoading,
    error,
    refetch,
    updateProfile,
  };
};
