export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobEvent {
  stage: string;
  message: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  type: string;
  label: string;
  layer_name?: string | null;
  filename: string;
  content_type: string;
  download_url?: string | null;
  size_bytes?: number | null;
  bounds?: number[] | null;
  metadata: Record<string, unknown>;
  is_download: boolean;
  display_order: number;
}

export interface LayerModel {
  name: string;
  label: string;
  kind: "raster" | "vector";
  download_url?: string | null;
  tilejson_url?: string | null;
  tiles_url?: string | null;
  data_url?: string | null;
  bounds?: number[] | null;
  default_visible: boolean;
  opacity: number;
  legend_color?: string | null;
}

export interface JobSummary {
  id: string;
  upload_id: string;
  project_name: string;
  description: string;
  segmenter: string;
  classifier: string;
  status: JobStatus;
  stage: string;
  progress: number;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  bounds?: number[] | null;
  raster_meta: Record<string, unknown>;
  artifact_count: number;
}

export interface JobDetail extends JobSummary {
  events: JobEvent[];
  artifacts: Artifact[];
  layers: LayerModel[];
}

export interface JobsResponse {
  jobs: JobSummary[];
  counts: Record<string, number>;
}

export interface AnalyticsResponse {
  job_id: string;
  summary: Record<string, unknown>;
}

export interface UploadTransport {
  kind: "azure_sas" | "backend_proxy";
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface UploadInitResponse {
  upload_id: string;
  blob_path: string;
  filename: string;
  content_type: string;
  transport: UploadTransport;
}

