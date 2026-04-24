import { apiClient } from "@/lib/apiClient";
import type {
  AdminSettingsPayload,
  BackendAdminOverview,
  BackendAdminProject,
  BackendAdminSystemSnapshot,
  BackendAdminUser,
  BackendHealthResponse,
} from "@/types";

export const adminClient = {
  getOverview(): Promise<BackendAdminOverview> {
    return apiClient.get<BackendAdminOverview>("/admin/overview");
  },

  listUsers(): Promise<BackendAdminUser[]> {
    return apiClient.get<BackendAdminUser[]>("/admin/users");
  },

  listPendingUsers(): Promise<BackendAdminUser[]> {
    return apiClient.get<BackendAdminUser[]>("/admin/users/pending");
  },

  approveUser(id: string): Promise<BackendAdminUser> {
    return apiClient.post<BackendAdminUser>(`/admin/users/${id}/approve`, {});
  },

  rejectUser(id: string): Promise<BackendAdminUser> {
    return apiClient.post<BackendAdminUser>(`/admin/users/${id}/reject`, {});
  },

  listProjects(): Promise<BackendAdminProject[]> {
    return apiClient.get<BackendAdminProject[]>("/admin/projects");
  },

  deleteProject(id: string): Promise<{ id: string }> {
    return apiClient.delete<{ id: string }>(`/admin/projects/${id}`);
  },

  getSystem(): Promise<BackendAdminSystemSnapshot> {
    return apiClient.get<BackendAdminSystemSnapshot>("/admin/system");
  },

  getSettings(): Promise<AdminSettingsPayload> {
    return apiClient.get<AdminSettingsPayload>("/admin/settings");
  },

  updateSettings(payload: AdminSettingsPayload): Promise<AdminSettingsPayload> {
    return apiClient.put<AdminSettingsPayload>("/admin/settings", payload);
  },

  getHealth(): Promise<BackendHealthResponse> {
    return apiClient.get<BackendHealthResponse>("/health");
  },
};
