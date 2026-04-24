import type { Polygon } from "geojson";

export type UserRole = "admin" | "user";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type JobType = "segmentation" | "classification" | "connectivity" | "full";
export type JobStatus = "pending" | "running" | "completed" | "failed";
export type PipelineStage = "segmentation" | "classification" | "connectivity";
export type RoadLabel = "Good" | "Damaged" | "Unpaved";
export type ReportType = "PDF" | "CSV" | "Shapefile";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
  status?: string;
}

export interface Region {
  id: string;
  project_id: string;
  name: string;
  polygon: Polygon;
  created_at: string;
}

export interface Job {
  id: string;
  region_id: string;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  error_message?: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_refs?: BackendJobResultRefs | null;
}

export interface SegmentationResult {
  id: string;
  job_id: string;
  mask_path: string;
  pixel_count: number;
  created_at: string;
}

export interface ClassificationResult {
  id: string;
  segmentation_id: string;
  patch_id?: string;
  road_label: RoadLabel;
  confidence: number;
  created_at: string;
}

export interface ConnectivityGraph {
  id: string;
  job_id: string;
  graph_path: string;
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface Report {
  id: string;
  job_id: string;
  report_type: ReportType;
  file_path: string;
  created_at: string;
  signed_url?: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  error?: string;
}

export interface BackendProfile {
  id: string;
  name?: string;
  full_name?: string;
  email?: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  created_at: string;
}

export interface BackendProject {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
  status?: string;
  updated_at?: string;
}

export interface BackendRegion {
  id: string;
  project_id: string;
  name: string;
  polygon: Polygon;
  created_at: string;
}

export interface BackendJob {
  id: string;
  region_id: string;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message?: string | null;
  result_refs?: BackendJobResultRefs | null;
}

export interface BackendJobResultRefs {
  inference_job_id?: string;
  downloads?: JobDownloads;
  stats?: JobStats;
}


export interface JobDownloads {
  normalised_tif?: string;
  seg_mask_tif?: string;
  good_tif?: string;
  damaged_tif?: string;
  unpaved_tif?: string;
  combined_tif?: string;
  component_map_tif?: string;
  betweenness_tif?: string;
  components_csv?: string;
  report_pdf?: string;
  report_zip?: string;
}

export interface JobStats {
  total_road_pixels: number;
  total_components: number;
  isolated_components: number;
  largest_component_pixels: number;
  avg_component_size: number;
}

export interface RoadFeatureProperties {
  road_id: number;
  condition: RoadLabel | "Unclassified";
  confidence: number;
  prob_good: number;
  prob_dam: number;
  prob_unp: number;
  length_m: number;
  component_id: number;
  review: boolean;
}

export type InferenceWSEventType =
  | "progress_update"
  | "job_completed"
  | "job_failed";

export interface InferenceWSEvent {
  type: InferenceWSEventType;
  job_id: string;
  timestamp: string;
  payload: {
    stage?: string;
    progress_pct?: number;
    message?: string;
    status?: string;
    scene_meta?: Record<string, unknown>;
    outputs?: JobDownloads;
    stats?: JobStats;
    error_message?: string;
  };
}

export interface BackendSegmentationResult {
  id: string;
  job_id: string;
  mask_path: string;
  pixel_count: number;
  created_at: string;
}

export interface BackendClassificationResult {
  id: string;
  segmentation_id: string;
  patch_id?: string;
  road_label: RoadLabel;
  confidence: number;
  created_at: string;
}

export interface BackendConnectivityGraph {
  id: string;
  job_id: string;
  graph_path?: string;
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface BackendReport {
  id: string;
  job_id: string;
  report_type: string;
  file_path: string;
  created_at: string;
  signed_url?: string;
}

export interface BackendJobResults {
  job_id: string;
  segmentation: BackendSegmentationResult | null;
  classification: BackendClassificationResult[];
  connectivity: BackendConnectivityGraph | null;
  downloads?: JobDownloads;
  stats?: JobStats;
}

export interface JobWebSocketMessage {
  job_id: string;
  type: "progress" | "status" | "result" | "error";
  progress: number;
  status: JobStatus;
  stage: PipelineStage;
  payload?: unknown;
}

export interface BackendAdminActivity {
  id: string;
  user: string;
  action: string;
  project: string;
  created_at: string;
}

export interface BackendAdminOverview {
  total_users: number;
  total_projects: number;
  active_jobs: number;
  reports_count: number;
  recent_activity: BackendAdminActivity[];
}

export interface BackendAdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approval_status: ApprovalStatus;
  project_count: number;
  created_at: string;
}

export interface BackendAdminProject {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  owner_name: string;
  region_count: number;
  status: string;
  created_at: string;
}

export interface BackendAdminLog {
  id: string;
  level: string;
  message: string;
  created_at: string;
}

export interface BackendAdminSystemSnapshot {
  cpu_percent: number;
  memory_used_gb: number;
  memory_total_gb: number;
  storage_used_gb: number;
  storage_total_tb: number;
  network_download_mbps: number;
  network_upload_mbps: number;
  network_level: "Normal" | "High" | "Critical" | string;
  active_jobs: number;
  reports_count: number;
  logs: BackendAdminLog[];
}

export interface BackendHealthResponse {
  status: "ok" | "degraded" | "error" | string;
  checks: Record<string, string>;
  version: string;
  timestamp: string;
}

export type AdminSettingsPayload = Record<string, string | boolean>;


const normalizeJobType = (value: string): JobType => {
  if (value === "segmentation" || value === "classification" || value === "connectivity" || value === "full") {
    return value;
  }

  return "segmentation";
};

const normalizeReportType = (value: string): ReportType => {
  const normalized = value.trim().toUpperCase();

  if (normalized === "CSV") {
    return "CSV";
  }

  if (normalized === "SHAPEFILE") {
    return "Shapefile";
  }

  return "PDF";
};


export const normalizeProfile = (profile: BackendProfile): Profile => {
  return {
    id: profile.id,
    name: profile.name ?? profile.full_name ?? "",
    email: profile.email ?? "",
    role: profile.role,
    approval_status: profile.approval_status,
    created_at: profile.created_at,
  };
};

export const normalizeProject = (project: BackendProject): Project => {
  return {
    id: project.id,
    owner_id: project.owner_id,
    name: project.name,
    description: project.description,
    created_at: project.created_at,
    status: project.status,
  };
};

export const normalizeRegion = (region: BackendRegion): Region => {
  return {
    id: region.id,
    project_id: region.project_id,
    name: region.name,
    polygon: region.polygon,
    created_at: region.created_at,
  };
};

export const normalizeJob = (job: BackendJob): Job => {
  return {
    id: job.id,
    region_id: job.region_id,
    job_type: normalizeJobType(job.job_type),
    status: job.status,
    progress: job.progress,
    error_message: job.error_message ?? null,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    result_refs: job.result_refs ?? null,
  };
};

export const normalizeSegmentationResult = (result: BackendSegmentationResult): SegmentationResult => {
  return {
    id: result.id,
    job_id: result.job_id,
    mask_path: result.mask_path,
    pixel_count: result.pixel_count,
    created_at: result.created_at,
  };
};

export const normalizeClassificationResult = (result: BackendClassificationResult): ClassificationResult => {
  return {
    id: result.id,
    segmentation_id: result.segmentation_id,
    patch_id: result.patch_id ?? undefined,
    road_label: result.road_label,
    confidence: result.confidence,
    created_at: result.created_at,
  };
};

export const normalizeConnectivityGraph = (graph: BackendConnectivityGraph): ConnectivityGraph => {
  return {
    id: graph.id,
    job_id: graph.job_id,
    graph_path: graph.graph_path ?? "",
    metrics: graph.metrics,
    created_at: graph.created_at,
  };
};

export const normalizeReport = (report: BackendReport): Report => {
  return {
    id: report.id,
    job_id: report.job_id,
    report_type: normalizeReportType(report.report_type),
    file_path: report.file_path,
    created_at: report.created_at,
    signed_url: report.signed_url,
  };
};
