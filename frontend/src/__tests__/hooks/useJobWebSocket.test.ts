/** This test suite verifies the job websocket hook connection lifecycle and state updates. */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";

import { useJobWebSocket } from "@/hooks/useJobWebSocket";
import { supabase } from "@/lib/supabaseClient";

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

const getSessionMock = supabase.auth.getSession as jest.MockedFunction<typeof supabase.auth.getSession>;

class MockWebSocket {
  public static instances: MockWebSocket[] = [];

  public readonly url: string;
  public readonly close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
  public readonly send = jest.fn();
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState = MockWebSocket.CONNECTING;

  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  public emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  public emitMessage(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }

  public emitError(): void {
    this.onerror?.(new Event("error"));
  }

  public emitClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  public static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe("useJobWebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.reset();
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "realtime-token",
        } as Session,
      },
      error: null,
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("connects to the correct websocket URL", async () => {
    renderHook(() => useJobWebSocket("job-123"));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    expect(MockWebSocket.instances[0]?.url).toBe("ws://localhost:8080/ws/jobs/job-123?token=realtime-token");
  });

  it("updates progress and status from incoming messages", async () => {
    const { result } = renderHook(() => useJobWebSocket("job-123"));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]?.emitOpen();
      MockWebSocket.instances[0]?.emitMessage(
        JSON.stringify({
          job_id: "job-123",
          type: "progress",
          progress: 48,
          status: "running",
          stage: "classification",
        }),
      );
    });

    expect(result.current.progress).toBe(48);
    expect(result.current.status).toBe("running");
    expect(result.current.stage).toBe("classification");
    expect(result.current.isConnected).toBe(true);
  });

  it("attempts reconnection up to three times", async () => {
    const { result } = renderHook(() => useJobWebSocket("job-123"));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    act(() => {
      MockWebSocket.instances[0]?.emitClose();
      jest.advanceTimersByTime(1500);
    });
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));

    act(() => {
      MockWebSocket.instances[1]?.emitClose();
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(3));

    act(() => {
      MockWebSocket.instances[2]?.emitClose();
      jest.advanceTimersByTime(4500);
    });
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(4));

    act(() => {
      MockWebSocket.instances[3]?.emitClose();
      jest.advanceTimersByTime(6000);
    });

    expect(MockWebSocket.instances).toHaveLength(4);
    expect(result.current.error).toBe("Live WebSocket connection was lost. Falling back to Supabase Realtime.");
  });

  it("cleans up the websocket connection on unmount", async () => {
    const { unmount } = renderHook(() => useJobWebSocket("job-123"));

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    const connection = MockWebSocket.instances[0];
    unmount();

    expect(connection?.close).toHaveBeenCalled();
  });
});
