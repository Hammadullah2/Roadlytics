import type {
  AnalyticsResponse,
  JobDetail,
  JobsResponse,
  UploadInitResponse,
} from "@/lib/types";
import { API_BASE_URL } from "@/lib/config";

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(fallback || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function reportUrl(jobId: string) {
  return apiUrl(`/api/jobs/${jobId}/report`);
}

export async function listJobs(limit = 50) {
  return requestJson<JobsResponse>(`/api/jobs?limit=${limit}`);
}

export async function getJob(jobId: string) {
  return requestJson<JobDetail>(`/api/jobs/${jobId}`);
}

export async function getAnalytics(jobId: string) {
  return requestJson<AnalyticsResponse>(`/api/jobs/${jobId}/analytics`);
}

export async function initUpload(file: File) {
  return requestJson<UploadInitResponse>(`/api/uploads/init`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || "image/tiff",
    }),
  });
}

async function uploadFile(file: File, upload: UploadInitResponse) {
  if (upload.transport.kind === "azure_sas") {
    const response = await fetch(upload.transport.url, {
      method: upload.transport.method,
      headers: upload.transport.headers,
      body: file,
    });
    if (!response.ok) {
      throw new Error("Azure Blob upload failed.");
    }
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(upload.transport.url, {
    method: upload.transport.method,
    body: formData,
  });
  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(fallback || "Backend upload failed.");
  }
}

export interface CreateJobPayload {
  projectName: string;
  description: string;
  file: File;
  segmenter: "DeepLabV3" | "PakOSM";
  classifier: "KMeans" | "EfficientNet";
}

export async function createAssessment(payload: CreateJobPayload) {
  const upload = await initUpload(payload.file);
  await uploadFile(payload.file, upload);
  return requestJson<JobDetail>(`/api/jobs`, {
    method: "POST",
    body: JSON.stringify({
      upload_id: upload.upload_id,
      project_name: payload.projectName,
      description: payload.description,
      segmenter: payload.segmenter,
      classifier: payload.classifier,
    }),
  });
}

export { API_BASE_URL };
