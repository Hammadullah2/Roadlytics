import { useEffect, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import type { BackendJobResults } from "@/types";

type UseJobResultsResult = {
  results: BackendJobResults | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export const useJobResults = (jobID: string): UseJobResultsResult => {
  const trimmedJobID = jobID.trim();
  const [results, setResults] = useState<BackendJobResults | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(trimmedJobID !== "");
  const [error, setError] = useState<string | null>(null);

  const refetch = async (): Promise<void> => {
    if (!trimmedJobID) {
      setResults(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextResults = await apiClient.get<BackendJobResults>(`/jobs/${trimmedJobID}/results`);
      setResults(nextResults);
    } catch (requestError: unknown) {
      setResults(null);
      setError(requestError instanceof Error ? requestError.message : "Failed to load job results.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
  }, [trimmedJobID]);

  return {
    results,
    isLoading,
    error,
    refetch,
  };
};
