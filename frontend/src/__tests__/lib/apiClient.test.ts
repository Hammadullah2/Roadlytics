/** This test suite verifies API client headers and auth-error handling. */
import type { Session } from "@supabase/supabase-js";

import { ApiClientError, apiClient } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

const getSessionMock = supabase.auth.getSession as jest.MockedFunction<typeof supabase.auth.getSession>;

const createJSONResponse = (payload: unknown, status: number): Response => {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({
      "Content-Type": "application/json",
    }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
};

describe("apiClient", () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "fake-jwt-token",
        } as Session,
      },
      error: null,
    });
    window.history.pushState({}, "", "/dashboard");
  });

  it("attaches the Authorization header for GET requests", async () => {
    fetchMock.mockResolvedValue(createJSONResponse({ data: { ok: true }, message: "success" }, 200));

    await apiClient.get<{ ok: boolean }>("/projects");

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(headers.get("Authorization")).toBe("Bearer fake-jwt-token");
  });

  it("sends the JSON Content-Type header for POST requests", async () => {
    fetchMock.mockResolvedValue(createJSONResponse({ data: { id: "project-1" }, message: "created" }, 200));

    await apiClient.post<{ id: string }>("/projects", { name: "Project One" });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("redirects to /login when the backend returns 401", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      return undefined;
    });

    fetchMock.mockResolvedValue(createJSONResponse({ error: "token expired" }, 401));

    try {
      await expect(apiClient.get("/auth/profile")).rejects.toMatchObject({
        status: 401,
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("returns a typed ApiClientError when the backend returns 403", async () => {
    fetchMock.mockResolvedValue(createJSONResponse({ error: "forbidden" }, 403));

    await expect(apiClient.get("/admin/users")).rejects.toEqual(new ApiClientError("forbidden", 403));
  });
});
