import { useCallback, useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import type { BackendJob, Job, JobStatus, JobType } from "@/types";
import { normalizeJob } from "@/types";

type UseJobRealtimeResult = {
  job: Job | null;
  isSubscribed: boolean;
};

const POLL_INTERVAL_MS = 3000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isJobStatus = (value: unknown): value is JobStatus => {
  return value === "pending" || value === "running" || value === "completed" || value === "failed";
};

const isJobType = (value: unknown): value is JobType => {
  return value === "segmentation" || value === "classification" || value === "connectivity" || value === "full";
};

const toNullableString = (value: unknown): string | null => {
  return typeof value === "string" ? value : null;
};

const parseBackendJob = (value: Record<string, unknown>): BackendJob | null => {
  const id = value.id;
  const regionID = value.region_id;
  const jobType = value.job_type;
  const status = value.status;
  const progress = value.progress;
  const createdAt = value.created_at;

  if (
    typeof id !== "string" ||
    typeof regionID !== "string" ||
    !isJobType(jobType) ||
    !isJobStatus(status) ||
    typeof progress !== "number" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    region_id: regionID,
    job_type: jobType,
    status,
    progress,
    created_at: createdAt,
    started_at: toNullableString(value.started_at),
    completed_at: toNullableString(value.completed_at),
    error_message: toNullableString(value.error_message),
  };
};

const isTerminal = (status: JobStatus): boolean =>
  status === "completed" || status === "failed";

export const useJobRealtime = (jobID: string): UseJobRealtimeResult => {
  const [job, setJob] = useState<Job | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobID = useRef<string>("");

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsSubscribed(false);
  }, []);

  const fetchJob = useCallback(async (id: string) => {
    try {
      const raw = await apiClient.get<unknown>(`/jobs/${id}`);
      if (!isRecord(raw)) return;
      const parsed = parseBackendJob(raw);
      if (!parsed) return;
      if (activeJobID.current !== id) return;
      const normalized = normalizeJob(parsed);
      setJob(normalized);
      if (isTerminal(parsed.status)) {
        stopPolling();
      }
    } catch {
      // network errors are transient — keep polling
    }
  }, [stopPolling]);

  useEffect(() => {
    if (!jobID) {
      setJob(null);
      stopPolling();
      return;
    }

    activeJobID.current = jobID;
    setJob(null);
    setIsSubscribed(true);

    void fetchJob(jobID);

    intervalRef.current = setInterval(() => {
      void fetchJob(jobID);
    }, POLL_INTERVAL_MS);

    return () => {
      activeJobID.current = "";
      stopPolling();
    };
  }, [jobID, fetchJob, stopPolling]);

  return { job, isSubscribed };
};
