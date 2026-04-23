import { apiClient } from "@/lib/apiClient";
import type { UploadPayload } from "@/models/UploadPayload";
import type { BackendJob, BackendProject, BackendRegion } from "@/types";

export class SatelliteUploadService {
  private static instance: SatelliteUploadService | null = null;

  private constructor() {}

  public static getInstance(): SatelliteUploadService {
    if (SatelliteUploadService.instance === null) {
      SatelliteUploadService.instance = new SatelliteUploadService();
    }

    return SatelliteUploadService.instance;
  }

  public async submitUpload(
    payload: UploadPayload,
  ): Promise<{ success: boolean; jobId: string }> {
    if (!payload.regionPolygon) {
      throw new Error("Draw a region on the map before submitting.");
    }

    const projectId = await this.resolveProjectId();
    const regionName = payload.region?.trim() || "Assessment Region";

    const region = await apiClient.post<BackendRegion>(
      `/projects/${projectId}/regions`,
      { name: regionName, polygon: payload.regionPolygon },
    );

    const job = await apiClient.post<BackendJob>("/jobs", {
      region_id: region.id,
      job_type: "full",
      start_date: payload.startDate || undefined,
      end_date: payload.endDate || undefined,
      max_cloud_cover: 0.15,
      resolution_m: 10,
    });

    return { success: true, jobId: job.id };
  }

  public async submitFileUpload(
    _file: File,
  ): Promise<{ success: boolean; jobId: string }> {
    throw new Error(
      "Satellite imagery is fetched automatically from the provider. Select 'Download from Satellite Provider' and draw your region instead.",
    );
  }

  private async resolveProjectId(): Promise<string> {
    const projects = await apiClient.get<BackendProject[]>("/projects");

    if (projects.length > 0) {
      return projects[0].id;
    }

    const created = await apiClient.post<BackendProject>("/projects", {
      name: "Road Analysis",
      description: "Auto-created for satellite assessment",
    });

    return created.id;
  }
}
