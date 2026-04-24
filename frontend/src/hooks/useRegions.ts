import { useEffect, useState } from "react";
import type { Polygon } from "geojson";

import { fetchAllRegions, fetchRegionsForProject } from "@/lib/workspaceData";
import { apiClient } from "@/lib/apiClient";
import { useAuthStore } from "@/store/authStore";
import type { BackendRegion, Region } from "@/types";
import { normalizeRegion } from "@/types";

type UseRegionsOptions = {
  projectId?: string;
  enabled?: boolean;
};

type UseRegionsResult = {
  regions: Region[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createRegion: (projectId: string, name: string, polygon: Polygon) => Promise<Region>;
  deleteRegion: (projectId: string, regionId: string) => Promise<void>;
};

export const useRegions = (options: UseRegionsOptions = {}): UseRegionsResult => {
  const projectID = options.projectId?.trim() ?? "";
  const enabled = options.enabled ?? true;
  const guestMode = useAuthStore((state) => state.guestMode);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const loadRegions = async (): Promise<void> => {
    if (!enabled || guestMode) {
      setRegions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextRegions = projectID ? await fetchRegionsForProject(projectID) : await fetchAllRegions();
      setRegions(nextRegions);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load regions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRegions();
  }, [enabled, guestMode, projectID]);

  return {
    regions,
    isLoading,
    error,
    refetch: loadRegions,
    createRegion: async (projectId: string, name: string, polygon: Polygon): Promise<Region> => {
      if (guestMode) {
        throw new Error("Guest mode is read-only.");
      }

      const created = await apiClient.post<BackendRegion>(`/projects/${projectId}/regions`, {
        name,
        polygon,
      });

      const normalized = normalizeRegion(created);
      setRegions((currentRegions) => {
        const matchesCurrentView = projectID === "" || projectID === projectId;
        if (!matchesCurrentView) {
          return currentRegions;
        }

        return [normalized, ...currentRegions];
      });

      return normalized;
    },
    deleteRegion: async (projectId: string, regionId: string): Promise<void> => {
      if (guestMode) {
        throw new Error("Guest mode is read-only.");
      }

      await apiClient.delete<{ message?: string }>(`/projects/${projectId}/regions/${regionId}`);
      setRegions((currentRegions) => currentRegions.filter((region) => region.id !== regionId));
    },
  };
};
