import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ProjectsGrid } from "@/components/projects/ProjectsGrid";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useRegions } from "@/hooks/useRegions";
import { readPolygonFromGeoJSONFile } from "@/lib/geojson";
import { apiClient } from "@/lib/apiClient";
import type { BackendJob } from "@/types";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const deriveProjectStatus = (statuses: string[]): string => {
  if (statuses.includes("failed")) return "Failed";
  if (statuses.includes("running")) return "In Progress";
  if (statuses.includes("completed")) return "Completed";
  if (statuses.length > 0) return "In Progress";
  return "New";
};

export const ProjectsPage = (): JSX.Element => {
  const navigate = useNavigate();
  const { projects, isLoading: isProjectsLoading, error: projectsError } = useProjects();
  const { regions, isLoading: isRegionsLoading, error: regionsError } = useRegions();
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const [search, setSearch] = useState("");

  const cards = projects
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .map((project) => {
      const projectRegions = regions.filter((r) => r.project_id === project.id);
      const projectStatuses = jobRecords
        .filter((record) => record.project.id === project.id)
        .map((record) => record.job.status);
      const statusLabel = deriveProjectStatus(projectStatuses);
      const regionLabel = `${projectRegions.length} region${projectRegions.length === 1 ? "" : "s"}`;

      return {
        id: project.id,
        title: project.name,
        subtitle: regionLabel,
        statusLabel,
        statusColor: "",
        displayDate: formatDate(project.created_at),
        route: `/projects/${project.id}`,
      };
    });

  return (
    <div>
      {/* Header */}
      <div className="row space-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Projects</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {projects.length} projects · Manage your road assessment areas
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="input-wrap" style={{ width: 260 }}>
            <SearchIcon />
            <input
              placeholder="Search projects…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
            />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => { navigate("/projects/new"); }}
          >
            <PlusIcon />
            New Project
          </button>
        </div>
      </div>

      <ProjectsGrid
        cards={cards}
        isLoading={isProjectsLoading || isRegionsLoading || isJobsLoading}
        error={projectsError ?? regionsError ?? jobsError ?? null}
      />
    </div>
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
  } = useRegions({ projectId: projectID, enabled: projectID !== "" });
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const project = projects.find((p) => p.id === projectID);
  const [regionName, setRegionName] = useState("");
  const [geojsonFile, setGeojsonFile] = useState<File | null>(null);
  const [shouldQueueJob, setShouldQueueJob] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingRegionID, setDeletingRegionID] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleCreateRegion = async (): Promise<void> => {
    if (!regionName.trim()) { setActionError("Region name is required."); return; }
    if (!geojsonFile) { setActionError("Choose a GeoJSON file for the region boundary."); return; }
    setIsSubmitting(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const polygon = await readPolygonFromGeoJSONFile(geojsonFile);
      const created = await createRegion(projectID, regionName.trim(), polygon);
      let msg = `Region "${created.name}" created.`;
      if (shouldQueueJob) {
        const job = await apiClient.post<BackendJob>("/jobs", { region_id: created.id, job_type: "segmentation" });
        msg += ` Job queued (${job.id.slice(0, 8)}…).`;
      }
      setActionMessage(msg);
      setRegionName("");
      setGeojsonFile(null);
      setShouldQueueJob(true);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to create region.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRegion = async (regionID: string): Promise<void> => {
    setDeletingRegionID(regionID);
    setActionError(null);
    setActionMessage(null);
    try {
      await deleteRegion(projectID, regionID);
      setActionMessage("Region deleted.");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to delete region.");
    } finally {
      setDeletingRegionID("");
    }
  };

  return (
    <div>
      <Link
        to="/projects"
        className="btn btn-ghost btn-sm"
        style={{ display: "inline-flex", marginBottom: 16, paddingLeft: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        Back to Projects
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">{project?.name ?? "Project Not Found"}</h1>
        <div className="muted" style={{ marginTop: 4 }}>
          {project?.description || "No description provided"}
          {project && <span style={{ marginLeft: 12 }}>· Created {formatDate(project.created_at)}</span>}
        </div>
      </div>

      {(projectsError || regionsError || jobsError || actionError) && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
          {actionError ?? projectsError ?? regionsError ?? jobsError}
        </div>
      )}

      {actionMessage && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--success) 10%, white)", color: "var(--success)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)" }}>
          {actionMessage}
        </div>
      )}

      {/* Create Region */}
      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Create Region from GeoJSON</h3>
        <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Upload a GeoJSON boundary file to define the assessment area.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div className="field">
            <label htmlFor="region-name">Region name</label>
            <input
              id="region-name"
              type="text"
              value={regionName}
              onChange={(e) => { setRegionName(e.target.value); }}
              placeholder="Primary survey boundary"
            />
          </div>
          <div className="field">
            <label htmlFor="region-file">GeoJSON file</label>
            <input
              id="region-file"
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={(e) => { setGeojsonFile(e.target.files?.[0] ?? null); }}
              style={{ padding: "8px 12px" }}
            />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => { void handleCreateRegion(); }}
            disabled={isSubmitting || !project}
          >
            {isSubmitting ? "Creating…" : "Create region"}
          </button>
        </div>

        <label style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={shouldQueueJob}
            onChange={(e) => { setShouldQueueJob(e.target.checked); }}
            style={{ accentColor: "var(--accent)" }}
          />
          Queue a segmentation job immediately after region creation
        </label>

        {geojsonFile && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{geojsonFile.name}</div>
        )}
      </div>

      {/* Regions list */}
      <div className="section-label">Regions ({regions.length})</div>

      {isProjectsLoading || isRegionsLoading || isJobsLoading ? (
        <div className="rl-grid rl-grid-3">
          {["s1", "s2", "s3"].map((k) => (
            <div key={k} style={{ height: 132, borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-secondary)" }} />
          ))}
        </div>
      ) : regions.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--radius-card)", color: "var(--text-secondary)", fontSize: 14 }}>
          No regions yet. Upload a GeoJSON boundary above to get started.
        </div>
      ) : (
        <div className="rl-grid rl-grid-3">
          {regions.map((region) => {
            const rJobs = jobRecords.filter((rec) => rec.region.id === region.id);
            return (
              <div key={region.id} className="card card-pad">
                <div className="row space-between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{region.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>Created {formatDate(region.created_at)}</div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--danger)", padding: "4px 8px" }}
                    type="button"
                    onClick={() => { void handleDeleteRegion(region.id); }}
                    disabled={deletingRegionID === region.id}
                  >
                    {deletingRegionID === region.id ? "…" : "Delete"}
                  </button>
                </div>
                <div className="row space-between" style={{ marginTop: 12, fontSize: 12 }}>
                  <span className="muted">{rJobs.length} job{rJobs.length === 1 ? "" : "s"}</span>
                  <Link
                    to={`/processing?region=${region.id}`}
                    style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none", fontSize: 12 }}
                  >
                    Open processing →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
