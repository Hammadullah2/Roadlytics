import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ProjectsGrid } from "@/components/projects/ProjectsGrid";
import { Button } from "@/components/ui/Button";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useRegions } from "@/hooks/useRegions";
import { readPolygonFromGeoJSONFile } from "@/lib/geojson";
import { apiClient } from "@/lib/apiClient";
import type { BackendJob } from "@/types";

class ProjectsPageCopy {
  public static readonly title = "Projects";
  public static readonly emptyDescription = "No description provided";
}

class ProjectDetailCopy {
  public static readonly backLabel = "Back to Projects";
  public static readonly missingTitle = "Project Not Found";
  public static readonly regionsTitle = "Regions";
  public static readonly noRegions = "No regions have been added to this project yet.";
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const deriveProjectPresentation = (statuses: string[]): { label: string; color: string } => {
  if (statuses.includes("failed")) {
    return { label: "Failed", color: "#f85149" };
  }

  if (statuses.includes("running")) {
    return { label: "In Progress", color: "#d29922" };
  }

  if (statuses.includes("completed")) {
    return { label: "Completed", color: "#2ea043" };
  }

  return { label: "Pending", color: "#8b949e" };
};

export const ProjectsPage = (): JSX.Element => {
  const {
    projects,
    isLoading: isProjectsLoading,
    error: projectsError,
    createProject,
  } = useProjects();
  const { regions, isLoading: isRegionsLoading, error: regionsError } = useRegions();
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const [projectName, setProjectName] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

  const cards = projects.map((project) => {
    const projectRegions = regions.filter((region) => region.project_id === project.id);
    const projectStatuses = jobRecords
      .filter((record) => record.project.id === project.id)
      .map((record) => record.job.status);
    const presentation = deriveProjectPresentation(projectStatuses);
    const regionLabel = `${projectRegions.length} region${projectRegions.length === 1 ? "" : "s"}`;

    return {
      id: project.id,
      title: project.name,
      subtitle: `${project.description || ProjectsPageCopy.emptyDescription} | ${regionLabel}`,
      statusLabel: presentation.label,
      statusColor: presentation.color,
      displayDate: formatDate(project.created_at),
      route: `/projects/${project.id}`,
    };
  });

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName.trim()) {
      setCreateError("Project name is required.");
      return;
    }

    setIsCreatingProject(true);
    setCreateError(null);
    setCreateMessage(null);

    try {
      await createProject(projectName.trim(), projectDescription.trim());
      setProjectName("");
      setProjectDescription("");
      setCreateMessage("Project created successfully.");
    } catch (error: unknown) {
      setCreateError(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <div className="mb-6 grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
          <h1 className="text-[1.75rem] font-bold text-[color:var(--text-primary)]">
            {ProjectsPageCopy.title}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            Create projects here before adding regions, uploads, and jobs.
          </p>

          {createError ? (
            <div className="mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {createError}
            </div>
          ) : null}

          {createMessage ? (
            <div className="mt-4 rounded-[10px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {createMessage}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="projects-create-name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Project name
              </label>
              <input
                id="projects-create-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                placeholder="Road Condition Baseline"
              />
            </div>

            <div>
              <label htmlFor="projects-create-description" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                Description
              </label>
              <textarea
                id="projects-create-description"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                className="min-h-[110px] w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                placeholder="Scope, district, or survey notes."
              />
            </div>

            <Button className="w-full" onClick={() => void handleCreateProject()} disabled={isCreatingProject}>
              {isCreatingProject ? "Creating project..." : "Create project"}
            </Button>
          </div>
        </section>

        <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
          <p className="text-sm text-[color:var(--text-secondary)]">
            Projects power the rest of the platform. Open one to upload a GeoJSON boundary, create a region, and queue jobs.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-4">
              <p className="text-[color:var(--text-secondary)]">Projects</p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{projects.length}</p>
            </div>
            <div className="rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-4">
              <p className="text-[color:var(--text-secondary)]">Regions</p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">{regions.length}</p>
            </div>
          </div>
        </section>
      </div>

      <ProjectsGrid
        cards={cards}
        isLoading={isProjectsLoading || isRegionsLoading || isJobsLoading}
        error={projectsError ?? regionsError ?? jobsError ?? null}
      />
    </section>
  );
};

export const ProjectDetailPage = (): JSX.Element => {
  const params = useParams();
  const projectID = params.id ?? "";
  const { projects, isLoading: isProjectsLoading, error: projectsError } = useProjects();
  const {
    regions,
    isLoading: isRegionsLoading,
    error: regionsError,
    createRegion,
    deleteRegion,
  } = useRegions({
    projectId: projectID,
    enabled: projectID !== "",
  });
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const project = projects.find((item) => item.id === projectID);
  const [regionName, setRegionName] = useState<string>("");
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [shouldQueueJob, setShouldQueueJob] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingRegionID, setDeletingRegionID] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleCreateRegion = async (): Promise<void> => {
    if (!projectID) {
      setActionError("Project not found.");
      return;
    }

    if (!regionName.trim()) {
      setActionError("Region name is required.");
      return;
    }

    if (!geojsonFile) {
      setActionError("Choose a GeoJSON file for the region boundary.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    setActionMessage(null);

    try {
      const polygon = await readPolygonFromGeoJSONFile(geojsonFile);
      const createdRegion = await createRegion(projectID, regionName.trim(), polygon);
      await apiClient.uploadFile<{ path: string }>("/upload/geojson", geojsonFile);

      let message = `Region ${createdRegion.name} created successfully.`;
      if (shouldQueueJob) {
        const job = await apiClient.post<BackendJob>("/jobs", {
          region_id: createdRegion.id,
          job_type: "segmentation",
        });
        message = `${message} Job queued (${job.id}).`;
      }

      setActionMessage(message);
      setRegionName("");
      setGeojsonFile(null);
      setShouldQueueJob(true);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to create region from GeoJSON.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRegion = async (regionID: string): Promise<void> => {
    if (!projectID) {
      return;
    }

    setDeletingRegionID(regionID);
    setActionError(null);
    setActionMessage(null);

    try {
      await deleteRegion(projectID, regionID);
      setActionMessage("Region deleted successfully.");
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : "Failed to delete region.");
    } finally {
      setDeletingRegionID("");
    }
  };

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <Link
        to="/projects"
        className="mb-5 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] transition-colors duration-150 hover:text-[color:var(--text-primary)]"
      >
        <ChevronLeft size={16} />
        <span>{ProjectDetailCopy.backLabel}</span>
      </Link>

      <h1 className="text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {project?.name ?? ProjectDetailCopy.missingTitle}
      </h1>
      <p className="mt-2 max-w-[760px] text-sm text-[color:var(--text-secondary)]">
        {project?.description || ProjectsPageCopy.emptyDescription}
      </p>

      {project ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">
          <span>{formatDate(project.created_at)}</span>
          <span>|</span>
          <span>{regions.length} Regions</span>
        </div>
      ) : null}

      {projectsError || regionsError || jobsError || actionError ? (
        <div className="mt-6 rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {actionError ?? projectsError ?? regionsError ?? jobsError}
        </div>
      ) : null}

      {actionMessage ? (
        <div className="mt-6 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          {actionMessage}
        </div>
      ) : null}

      <section className="mt-8 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
        <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">Create Region From GeoJSON</h2>
        <p className="mt-2 max-w-[720px] text-sm text-[color:var(--text-secondary)]">
          Upload a GeoJSON boundary file to create the region. The original file is also archived in storage.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="project-detail-region-name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
              Region name
            </label>
            <input
              id="project-detail-region-name"
              value={regionName}
              onChange={(event) => setRegionName(event.target.value)}
              className="w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
              placeholder="Primary survey boundary"
            />
          </div>

          <div>
            <label htmlFor="project-detail-region-file" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
              GeoJSON file
            </label>
            <input
              id="project-detail-region-file"
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={(event) => setGeojsonFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-emerald-400"
            />
          </div>

          <div className="flex items-end">
            <Button className="h-11 w-full lg:w-auto" onClick={() => void handleCreateRegion()} disabled={isSubmitting || !project}>
              {isSubmitting ? "Creating..." : "Create region"}
            </Button>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)]">
          <input
            type="checkbox"
            checked={shouldQueueJob}
            onChange={(event) => setShouldQueueJob(event.target.checked)}
            className="h-4 w-4 rounded border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] text-[color:var(--accent-green)]"
          />
          <span>Queue a segmentation job immediately after region creation</span>
        </label>

        {geojsonFile ? (
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[color:var(--text-nav-label)]">
            {geojsonFile.name}
          </p>
        ) : null}
      </section>

      {isProjectsLoading || isRegionsLoading || isJobsLoading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["region-skeleton-1", "region-skeleton-2", "region-skeleton-3"].map((item) => (
            <div
              key={item}
              className="h-[132px] animate-pulse rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]"
            />
          ))}
        </div>
      ) : project ? (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-[color:var(--text-primary)]">
            {ProjectDetailCopy.regionsTitle}
          </h2>

          {regions.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[color:var(--border-subtle)] px-5 py-10 text-center text-sm text-[color:var(--text-secondary)]">
              {ProjectDetailCopy.noRegions}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {regions.map((region) => {
                const regionJobs = jobRecords.filter((record) => record.region.id === region.id);

                return (
                  <div
                    key={region.id}
                    className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-[color:var(--text-primary)]">{region.name}</h3>
                        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                          Created on {formatDate(region.created_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteRegion(region.id)}
                        disabled={deletingRegionID === region.id}
                        className="rounded-[8px] border border-red-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-300 transition-colors duration-150 hover:bg-red-500/10 disabled:opacity-60"
                      >
                        {deletingRegionID === region.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[color:var(--text-nav-label)]">
                      <span>{regionJobs.length} Job{regionJobs.length === 1 ? "" : "s"}</span>
                      <Link to={`/processing?region=${region.id}`} className="font-semibold text-emerald-300 hover:text-emerald-200">
                        Open processing
                      </Link>
                    </div>

                    <p className="mt-4 break-all text-xs uppercase tracking-[0.14em] text-[color:var(--text-nav-label)]">
                      {region.id}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
};
