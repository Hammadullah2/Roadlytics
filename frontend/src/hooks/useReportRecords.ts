import { useEffect, useState } from "react";

import { fetchReportRecords, type ReportRecord } from "@/lib/workspaceData";
import { useAuthStore } from "@/store/authStore";
import type { Report } from "@/types";

type UseReportRecordsResult = {
  records: ReportRecord[];
  reports: Report[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useReportRecords = (): UseReportRecordsResult => {
  const guestMode = useAuthStore((state) => state.guestMode);
  const [records, setRecords] = useState<ReportRecord[]>([]);
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
      const nextRecords = await fetchReportRecords();
      setRecords(nextRecords);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load reports.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
  }, [guestMode]);

  return {
    records,
    reports: records.map((record) => record.report),
    isLoading,
    error,
    refetch,
  };
};
