import { useEffect, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import type { BackendJob, BackendProject, BackendRegion, Job } from "@/types";
import { normalizeJob, normalizeProject, normalizeRegion } from "@/types";

type UseJobsResult = {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const loadJobs = async (): Promise<Job[]> => {
  const rawProjects = await apiClient.get<BackendProject[]>("/projects");
  const projects = (Array.isArray(rawProjects) ? rawProjects : []).map(normalizeProject);

  const jobsByProject = await Promise.all(
    projects.map(async (project) => {
      const rawRegions = await apiClient.get<BackendRegion[]>(`/projects/${project.id}/regions`);
      const regions = (Array.isArray(rawRegions) ? rawRegions : []).map(normalizeRegion);

      const jobsByRegion = await Promise.all(
        regions.map(async (region) => {
          const jobs = await apiClient.get<BackendJob[]>(`/regions/${region.id}/jobs`);
          return (Array.isArray(jobs) ? jobs : []).map(normalizeJob);
        }),
      );

      return jobsByRegion.flat();
    }),
  );

  return jobsByProject.flat().sort((leftJob, rightJob) => {
    return new Date(rightJob.created_at).getTime() - new Date(leftJob.created_at).getTime();
  });
};

export const useJobs = (): UseJobsResult => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      setJobs(await loadJobs());
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load jobs.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refetch();
  }, []);

  return {
    jobs,
    isLoading,
    error,
    refetch,
  };
};
