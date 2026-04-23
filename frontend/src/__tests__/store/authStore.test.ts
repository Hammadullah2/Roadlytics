/** This test suite verifies auth store sign-in, sign-out, and session restoration behavior. */
import type { Session } from "@supabase/supabase-js";

const mockedSupabase = {
  auth: {
    signInWithPassword: jest.fn(),
    signInWithOAuth: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
  },
};

const mockedApiClient = {
  post: jest.fn(),
};

jest.mock("@/lib/supabaseClient", () => ({
  supabase: mockedSupabase,
}));

jest.mock("@/lib/apiClient", () => ({
  ApiClientError: class ApiClientError extends Error {
    public readonly status: number;

    public constructor(message: string, status: number) {
      super(message);
      this.name = "ApiClientError";
      this.status = status;
    }
  },
  apiClient: mockedApiClient,
}));

const fakeSession = {
  access_token: "session-token",
} as Session;

const fakeProfile = {
  id: "user-1",
  name: "Road Tester",
  email: "tester@example.com",
  role: "user" as const,
  approval_status: "approved" as const,
  created_at: new Date().toISOString(),
};

const loadFreshAuthStore = async () => {
  jest.resetModules();
  return import("@/store/authStore");
};

describe("authStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockedSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    });
  });

  it("calls signInWithPassword during signIn()", async () => {
    mockedSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: fakeSession,
      },
      error: null,
    });
    mockedApiClient.post.mockResolvedValue(fakeProfile);

    const { useAuthStore } = await loadFreshAuthStore();
    await useAuthStore.getState().signIn("tester@example.com", "secret");

    expect(mockedSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "tester@example.com",
      password: "secret",
    });
    expect(useAuthStore.getState().session).toBe(fakeSession);
    expect(useAuthStore.getState().user?.email).toBe("tester@example.com");
  });

  it("clears user and session state during signOut()", async () => {
    mockedSupabase.auth.signOut.mockResolvedValue({ error: null });

    const { useAuthStore } = await loadFreshAuthStore();
    useAuthStore.setState({
      user: fakeProfile,
      session: fakeSession,
      isAuthenticated: true,
      isLoading: false,
    });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("restores the current session during loadSession()", async () => {
    mockedSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: fakeSession,
      },
      error: null,
    });
    mockedApiClient.post.mockResolvedValue(fakeProfile);

    const { useAuthStore } = await loadFreshAuthStore();
    await useAuthStore.getState().loadSession();

    expect(mockedSupabase.auth.getSession).toHaveBeenCalled();
    expect(useAuthStore.getState().session).toBe(fakeSession);
    expect(useAuthStore.getState().user?.id).toBe("user-1");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("persists guest mode when enabled", async () => {
    const { useAuthStore } = await loadFreshAuthStore();

    useAuthStore.getState().setGuestMode(true);

    expect(useAuthStore.getState().guestMode).toBe(true);
    expect(window.localStorage.getItem("road-quality-guest-mode")).toBe("true");

    useAuthStore.getState().setGuestMode(false);

    expect(useAuthStore.getState().guestMode).toBe(false);
    expect(window.localStorage.getItem("road-quality-guest-mode")).toBeNull();
  });

  it("restores guest mode from local storage", async () => {
    window.localStorage.setItem("road-quality-guest-mode", "true");

    const { useAuthStore } = await loadFreshAuthStore();

    expect(useAuthStore.getState().guestMode).toBe(true);
  });
});
