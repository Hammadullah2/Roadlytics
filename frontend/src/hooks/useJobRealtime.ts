import { useEffect, useState } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabaseClient";
import type { BackendJob, Job, JobStatus, JobType } from "@/types";
import { normalizeJob } from "@/types";

type UseJobRealtimeResult = {
  job: Job | null;
  isSubscribed: boolean;
};

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

export const useJobRealtime = (jobID: string): UseJobRealtimeResult => {
  const [job, setJob] = useState<Job | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  useEffect(() => {
    if (!jobID) {
      setJob(null);
      setIsSubscribed(false);
      return;
    }

    setJob(null);
    const channelName = `job-realtime-${jobID}`;
    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobID}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (!isRecord(payload.new)) {
            return;
          }

          const parsedJob = parseBackendJob(payload.new);
          if (!parsedJob) {
            return;
          }

          setJob(normalizeJob(parsedJob));
        },
      )
      .subscribe((status) => {
        setIsSubscribed(status === "SUBSCRIBED");
      });

    return () => {
      setIsSubscribed(false);
      void supabase.removeChannel(channel);
    };
  }, [jobID]);

  return {
    job,
    isSubscribed,
  };
};
