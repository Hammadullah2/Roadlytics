import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { useProjects } from "@/hooks/useProjects";
import { readPolygonFromGeoJSONFile } from "@/lib/geojson";
import { apiClient } from "@/lib/apiClient";
import type { BackendJob, BackendRegion } from "@/types";

class UploadPageCopy {
  public static readonly title = "Upload Region Boundary";
  public static readonly subtitle =
    "Create a region from a GeoJSON Polygon or MultiPolygon file, archive the original upload, and optionally queue a segmentation job.";
}

type UploadSuccessState = {
  projectId: string;
  region: BackendRegion;
  storagePath: string;
  job: BackendJob | null;
};

export const UploadPage = (): JSX.Element => {
  const {
    projects,
    isLoading: isProjectsLoading,
    error: projectsError,
    createProject,
  } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");
  const [regionName, setRegionName] = useState<string>("");
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [shouldQueueJob, setShouldQueueJob] = useState<boolean>(true);
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<UploadSuccessState | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectId("");
      return;
    }

    const stillExists = projects.some((project) => project.id === selectedProjectId);
    if (!stillExists) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName.trim()) {
      setErrorMessage("Project name is required.");
      return;
    }

    setIsCreatingProject(true);
    setErrorMessage(null);

    try {
      const project = await createProject(projectName.trim(), projectDescription.trim());
      setSelectedProjectId(project.id);
      setProjectName("");
      setProjectDescription("");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selectedProjectId) {
      setErrorMessage("Select or create a project first.");
      return;
    }

    if (!regionName.trim()) {
      setErrorMessage("Region name is required.");
      return;
    }

    if (!geojsonFile) {
      setErrorMessage("Choose a GeoJSON file to upload.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccess(null);

    try {
      const polygon = await readPolygonFromGeoJSONFile(geojsonFile);
      const region = await apiClient.post<BackendRegion>(`/projects/${selectedProjectId}/regions`, {
        name: regionName.trim(),
        polygon,
      });
      const uploadResult = await apiClient.uploadFile<{ path: string }>("/upload/geojson", geojsonFile);

      let job: BackendJob | null = null;
      if (shouldQueueJob) {
        job = await apiClient.post<BackendJob>("/jobs", {
          region_id: region.id,
          job_type: "segmentation",
        });
      }

      setSuccess({
        projectId: selectedProjectId,
        region,
        storagePath: uploadResult.path,
        job,
      });
      setRegionName("");
      setGeojsonFile(null);
      setShouldQueueJob(true);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to process the uploaded GeoJSON.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <h1 className="mb-2 text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {UploadPageCopy.title}
      </h1>
      <p className="mb-6 max-w-[760px] text-sm text-[color:var(--text-secondary)]">
        {UploadPageCopy.subtitle}
      </p>

      {projectsError ? (
        <div className="mb-4 rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {projectsError}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-4 rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {errorMessage}
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          <p className="font-semibold">Region created successfully.</p>
          <p className="mt-2">Region ID: {success.region.id}</p>
          <p className="mt-1 break-all">Storage Path: {success.storagePath}</p>
          <p className="mt-1">
            Job: {success.job ? `Queued (${success.job.id})` : "Not queued"}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to={`/projects/${success.projectId}`} className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
              View project
            </Link>
            {success.job ? (
              <Link to={`/processing?region=${success.region.id}`} className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
                Open processing
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
          <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Create Project</h2>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            Create a project first if you do not already have one for this region.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="upload-project-name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Project name
              </label>
              <input
                id="upload-project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                placeholder="Rural Sindh Survey"
              />
            </div>

            <div>
              <label htmlFor="upload-project-description" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Description
              </label>
              <textarea
                id="upload-project-description"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                className="min-h-[110px] w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                placeholder="Baseline survey for project stakeholders."
              />
            </div>

            <Button className="w-full" onClick={() => void handleCreateProject()} disabled={isCreatingProject}>
              {isCreatingProject ? "Creating project..." : "Create project"}
            </Button>
          </div>
        </section>

        <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
          <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Create Region From GeoJSON</h2>
          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="upload-project-select" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Project
              </label>
              <select
                id="upload-project-select"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                disabled={isProjectsLoading || projects.length === 0}
                className="h-11 w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
              >
                {projects.length === 0 ? <option value="">Create a project first</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="upload-region-name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Region name
              </label>
              <input
                id="upload-region-name"
                value={regionName}
                onChange={(event) => setRegionName(event.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                placeholder="Taluka boundary - north"
              />
            </div>

            <div>
              <label htmlFor="upload-geojson-file" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                GeoJSON file
              </label>
              <input
                id="upload-geojson-file"
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={(event) => setGeojsonFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-emerald-400"
              />
              {geojsonFile ? (
                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[color:var(--text-nav-label)]">
                  {geojsonFile.name}
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-3 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)]">
              <input
                type="checkbox"
                checked={shouldQueueJob}
                onChange={(event) => setShouldQueueJob(event.target.checked)}
                className="h-4 w-4 rounded border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] text-[color:var(--accent-green)]"
              />
              <span>Queue a segmentation job after the region is created</span>
            </label>

            <Button className="w-full" onClick={() => void handleSubmit()} disabled={isSubmitting || isProjectsLoading}>
              {isSubmitting ? "Processing upload..." : "Create region from GeoJSON"}
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
};
