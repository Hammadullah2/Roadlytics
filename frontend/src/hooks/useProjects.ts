import { useEffect, useState } from "react";

import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import type { BackendProject, Project } from "@/types";
import { normalizeProject } from "@/types";

type UseProjectsResult = {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createProject: (name: string, description: string) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
};

export const useProjects = (): UseProjectsResult => {
  const guestMode = useAuthStore((state) => state.guestMode);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = async (): Promise<void> => {
    if (guestMode) {
      setProjects([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<BackendProject[]>("/projects");
      setProjects((Array.isArray(response) ? response : []).map(normalizeProject));
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load projects.");
    } finally {
      setIsLoading(false);
    }
  };

  const createProject = async (name: string, description: string): Promise<Project> => {
    if (guestMode) {
      throw new Error("Guest mode is read-only.");
    }

    const created = await apiClient.post<BackendProject>("/projects", {
      name,
      description,
    });

    const normalized = normalizeProject(created);
    setProjects((currentProjects) => [normalized, ...currentProjects]);
    return normalized;
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    if (guestMode) {
      throw new Error("Guest mode is read-only.");
    }

    await apiClient.delete<{ message?: string }>(`/projects/${projectId}`);
    setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
  };

  useEffect(() => {
    void refetch();
  }, [guestMode]);

  return {
    projects,
    isLoading,
    error,
    refetch,
    createProject,
    deleteProject,
  };
};
