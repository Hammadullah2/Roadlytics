/** Tests for the HTTP-polling job realtime hook. */
import { act, renderHook, waitFor } from "@testing-library/react";

// Mock apiClient before anything imports it (prevents VITE_API_URL throw)
jest.mock("@/lib/apiClient", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

import { useJobRealtime } from "@/hooks/useJobRealtime";
import { apiClient } from "@/lib/apiClient";

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

const makeJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-42",
  region_id: "region-1",
  job_type: "full",
  status: "pending",
  progress: 0,
  created_at: "2024-01-01T00:00:00Z",
  started_at: null,
  completed_at: null,
  error_message: null,
  ...overrides,
});

describe("useJobRealtime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGet.mockResolvedValue(makeJob());
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("fetches job immediately on mount", async () => {
    renderHook(() => useJobRealtime("job-42"));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/jobs/job-42");
    });
  });

  it("returns job data after first fetch", async () => {
    mockGet.mockResolvedValue(makeJob({ status: "running", progress: 40 }));
    const { result } = renderHook(() => useJobRealtime("job-42"));

    await waitFor(() => {
      expect(result.current.job).not.toBeNull();
    });

    expect(result.current.job?.id).toBe("job-42");
    expect(result.current.job?.progress).toBe(40);
    expect(result.current.job?.status).toBe("running");
    expect(result.current.isSubscribed).toBe(true);
  });

  it("polls again after 3 seconds", async () => {
    renderHook(() => useJobRealtime("job-42"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    act(() => { jest.advanceTimersByTime(3000); });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it("stops polling when job reaches completed status", async () => {
    mockGet.mockResolvedValue(makeJob({ status: "running", progress: 50 }));
    renderHook(() => useJobRealtime("job-42"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    mockGet.mockResolvedValue(makeJob({ status: "completed", progress: 100 }));
    act(() => { jest.advanceTimersByTime(3000); });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));

    // No more calls after terminal state
    act(() => { jest.advanceTimersByTime(9000); });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("stops polling when job reaches failed status", async () => {
    mockGet.mockResolvedValue(makeJob({ status: "failed", progress: 30 }));
    renderHook(() => useJobRealtime("job-42"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    act(() => { jest.advanceTimersByTime(9000); });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when jobID is empty", () => {
    renderHook(() => useJobRealtime(""));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("clears interval on unmount", async () => {
    const { unmount } = renderHook(() => useJobRealtime("job-42"));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));

    unmount();
    act(() => { jest.advanceTimersByTime(9000); });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
