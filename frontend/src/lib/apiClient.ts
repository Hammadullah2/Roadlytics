import { supabase } from "@/lib/supabaseClient";
import type { ApiResponse } from "@/types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const apiBaseUrl = (import.meta.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const GUEST_MODE_KEY = "road-quality-guest-mode";

if (!apiBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required");
}

export class ApiClientError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const extractMessage = (payload: unknown): string | null => {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const error = payload.error;
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim() !== "") {
    return message;
  }

  return null;
};

const isApiResponse = <T,>(payload: unknown): payload is ApiResponse<T> => {
  return isRecord(payload) && "data" in payload && "message" in payload;
};

const toPayload = <T,>(payload: unknown): T => {
  if (isApiResponse<T>(payload)) {
    return payload.data;
  }

  return payload as T;
};

const redirectToLogin = (): void => {
  if (window.location.pathname !== "/login" && window.location.pathname !== "/login/admin") {
    window.location.assign("/login");
  }
};

const isGuestModeEnabled = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(GUEST_MODE_KEY) === "true";
};

const getAccessToken = async (): Promise<string | null> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
};

const request = async <T,>(
  method: HttpMethod,
  endpoint: string,
  body?: FormData | BodyInit | null,
): Promise<T> => {
  const token = await getAccessToken();
  const headers = new Headers();
  const isFormData = body instanceof FormData;

  if (!isFormData) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`, {
    method,
    headers,
    body,
  });

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (response.status === 401) {
    if (!isGuestModeEnabled()) {
      redirectToLogin();
    }
    throw new ApiClientError(extractMessage(payload) ?? "Your session has expired. Please sign in again.", 401);
  }

  if (response.status === 403) {
    throw new ApiClientError(extractMessage(payload) ?? "You do not have permission to perform this action.", 403);
  }

  if (!response.ok) {
    throw new ApiClientError(extractMessage(payload) ?? "Request failed.", response.status);
  }

  return toPayload<T>(payload);
};

export const apiClient = {
  get: <T,>(endpoint: string): Promise<T> => {
    return request<T>("GET", endpoint);
  },
  post: <T,>(endpoint: string, body: unknown): Promise<T> => {
    return request<T>("POST", endpoint, JSON.stringify(body));
  },
  put: <T,>(endpoint: string, body: unknown): Promise<T> => {
    return request<T>("PUT", endpoint, JSON.stringify(body));
  },
  patch: <T,>(endpoint: string, body: unknown): Promise<T> => {
    return request<T>("PATCH", endpoint, JSON.stringify(body));
  },
  delete: <T,>(endpoint: string): Promise<T> => {
    return request<T>("DELETE", endpoint);
  },
  uploadFile: <T,>(endpoint: string, file: File): Promise<T> => {
    const formData = new FormData();
    formData.append("file", file);
    return request<T>("POST", endpoint, formData);
  },
};
