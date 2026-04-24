import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";

import { ApiClientError, apiClient } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";
import type { BackendProfile, Profile } from "@/types";
import { normalizeProfile } from "@/types";

type AuthStoreState = {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  guestMode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  setGuestMode: (enabled: boolean) => void;
};

const GUEST_MODE_KEY = "road-quality-guest-mode";

let hasRegisteredAuthListener = false;
let hasLoadedInitialSession = false;

const readGuestMode = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GUEST_MODE_KEY) === "true";
};

const persistGuestMode = (enabled: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (enabled) {
    window.localStorage.setItem(GUEST_MODE_KEY, "true");
    return;
  }

  window.localStorage.removeItem(GUEST_MODE_KEY);
};

const loadProfile = async (): Promise<Profile | null> => {
  try {
    const backendProfile = await apiClient.post<BackendProfile>("/auth/profile", {});
    return normalizeProfile(backendProfile);
  } catch (error: unknown) {
    if (error instanceof ApiClientError && error.status === 404) {
      return null;
    }

    throw error;
  }
};

const syncSession = async (session: Session | null): Promise<void> => {
  if (!session) {
    useAuthStore.setState({
      session: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    return;
  }

  const currentState = useAuthStore.getState();
  const isSameUser =
    currentState.isAuthenticated &&
    currentState.user !== null &&
    currentState.session?.user.id === session.user.id;

  useAuthStore.setState({
    session,
    isAuthenticated: true,
    isLoading: !isSameUser,
    guestMode: false,
  });
  persistGuestMode(false);

  try {
    const user = await loadProfile();

    useAuthStore.setState({
      session,
      user,
      isAuthenticated: true,
      isLoading: false,
    });
  } catch (error) {
    // If loading the profile fails, stop the infinite loading spinner
    console.error("Failed to load profile during syncSession:", error);
    useAuthStore.setState({
      session,
      user: null,
      isAuthenticated: true,
      isLoading: false,
    });
  }
};

const registerAuthListener = (): void => {
  if (hasRegisteredAuthListener) {
    return;
  }

  hasRegisteredAuthListener = true;

  supabase.auth.onAuthStateChange((_event, session) => {
    void syncSession(session);
  });
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  guestMode: readGuestMode(),
  signIn: async (email: string, password: string): Promise<void> => {
    set({ isLoading: true });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ isLoading: false });
      throw new Error(error.message);
    }

    await syncSession(data.session);
  },
  signInWithGoogle: async (): Promise<void> => {
    set({ isLoading: true });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      set({ isLoading: false });
      throw new Error(error.message);
    }
  },
  signOut: async (): Promise<void> => {
    await supabase.auth.signOut();
    persistGuestMode(false);
    set({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      guestMode: false,
    });
  },
  loadSession: async (): Promise<void> => {
    registerAuthListener();

    if (hasLoadedInitialSession) {
      return;
    }

    hasLoadedInitialSession = true;
    set({ isLoading: true });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    await syncSession(session);
  },
  setGuestMode: (enabled: boolean): void => {
    persistGuestMode(enabled);
    set({ guestMode: enabled });
  },
}));
