import { useEffect, useState } from "react";

import { fetchJobRecords, type JobRecord } from "@/lib/workspaceData";
import { useAuthStore } from "@/store/authStore";
import type { Job } from "@/types";

type UseJobRecordsResult = {
  records: JobRecord[];
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useJobRecords = (): UseJobRecordsResult => {
  const guestMode = useAuthStore((state) => state.guestMode);
  const [records, setRecords] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async (): Promise<void> => {
    if (guestMode) {
      setRecords([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextRecords = await fetchJobRecords();
      setRecords(nextRecords);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load jobs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
  }, [guestMode]);

  return {
    records,
    jobs: records.map((record) => record.job),
    isLoading,
    error,
    refetch,
  };
};
