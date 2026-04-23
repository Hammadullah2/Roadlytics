/** This test suite verifies the Supabase Realtime fallback hook subscription behavior. */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { useJobRealtime } from "@/hooks/useJobRealtime";
import { supabase } from "@/lib/supabaseClient";

jest.mock("@/lib/supabaseClient", () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

const channelMock = {
  on: jest.fn(),
  subscribe: jest.fn(),
};

const supabaseChannelMock = supabase.channel as jest.MockedFunction<typeof supabase.channel>;
const removeChannelMock = supabase.removeChannel as jest.MockedFunction<typeof supabase.removeChannel>;

describe("useJobRealtime", () => {
  let changeHandler: ((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void) | null = null;

  beforeEach(() => {
    changeHandler = null;
    channelMock.on.mockImplementation(
      (
        _event: string,
        _filter: Record<string, string>,
        handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
      ) => {
        changeHandler = handler;
        return channelMock;
      },
    );
    channelMock.subscribe.mockImplementation((handler: (status: "SUBSCRIBED") => void) => {
      handler("SUBSCRIBED");
      return channelMock;
    });
    supabaseChannelMock.mockReturnValue(channelMock as unknown as RealtimeChannel);
    removeChannelMock.mockResolvedValue("ok");
  });

  it("subscribes to the correct Supabase Realtime channel", async () => {
    const { result } = renderHook(() => useJobRealtime("job-42"));

    expect(supabaseChannelMock).toHaveBeenCalledWith("job-realtime-job-42");
    expect(channelMock.on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "jobs",
        filter: "id=eq.job-42",
      },
      expect.any(Function),
    );

    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });
  });

  it("updates job state when a postgres_changes event arrives", async () => {
    const { result } = renderHook(() => useJobRealtime("job-42"));

    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });

    act(() => {
      changeHandler?.({
        schema: "public",
        table: "jobs",
        commit_timestamp: new Date().toISOString(),
        eventType: "UPDATE",
        errors: [],
        new: {
          id: "job-42",
          region_id: "region-1",
          job_type: "segmentation",
          status: "running",
          progress: 64,
          created_at: new Date().toISOString(),
          started_at: null,
          completed_at: null,
          error_message: null,
        },
        old: {},
      } as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>);
    });

    expect(result.current.job?.id).toBe("job-42");
    expect(result.current.job?.progress).toBe(64);
    expect(result.current.job?.status).toBe("running");
  });

  it("unsubscribes from the channel on unmount", async () => {
    const { unmount } = renderHook(() => useJobRealtime("job-42"));

    unmount();

    expect(removeChannelMock).toHaveBeenCalledWith(channelMock);
  });
});
