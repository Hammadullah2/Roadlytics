import type { Polygon } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AssessmentMap } from "@/components/map/AssessmentMap";
import { Button } from "@/components/ui/Button";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useJobResults } from "@/hooks/useJobResults";
import { useProjects } from "@/hooks/useProjects";
import { useRegions } from "@/hooks/useRegions";
import { apiBaseUrl, apiClient } from "@/lib/apiClient";
import {
  SATELLITE_UPLOAD_DRAW_QUERY_PARAM,
  SATELLITE_UPLOAD_DRAW_QUERY_VALUE,
  SATELLITE_UPLOAD_RETURN_TO_QUERY_PARAM,
  buildSatelliteUploadReturnPath,
  storeSatelliteUploadRegionSelection,
} from "@/lib/satelliteUploadDraft";
import type { BackendJob } from "@/types";
import type { FeatureCollection } from "geojson";

class MapAnalysisPageCopy {
  public static readonly title = "Map Analysis";
  public static readonly subtitle = "Review project regions and backend-generated overlays from the latest completed jobs.";
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatMetricValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return JSON.stringify(value);
};

export const MapAnalysisPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedJobID = searchParams.get("job") ?? "";
  const drawMode = searchParams.get(SATELLITE_UPLOAD_DRAW_QUERY_PARAM) === SATELLITE_UPLOAD_DRAW_QUERY_VALUE;
  const uploadReturnPath = searchParams.get(SATELLITE_UPLOAD_RETURN_TO_QUERY_PARAM) || buildSatelliteUploadReturnPath();
  const { projects } = useProjects();
  const { regions, isLoading: isRegionsLoading, error: regionsError, createRegion } = useRegions();
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const [selectedJobID, setSelectedJobID] = useState<string>("");
  const [drawnRegionPolygon, setDrawnRegionPolygon] = useState<Polygon | null>(null);
  const [drawnRegionName, setDrawnRegionName] = useState<string>("");
  const [drawnRegionProjectID, setDrawnRegionProjectID] = useState<string>("");
  const [isSavingDrawnRegion, setIsSavingDrawnRegion] = useState<boolean>(false);
  const [drawnRegionError, setDrawnRegionError] = useState<string | null>(null);

  const selectableJobRecords = useMemo(() => {
    const completedJobs = jobRecords.filter((record) => record.job.status === "completed");
    return completedJobs.length > 0 ? completedJobs : jobRecords;
  }, [jobRecords]);

  useEffect(() => {
    if (selectableJobRecords.length === 0) {
      if (selectedJobID !== "") {
        setSelectedJobID("");
      }
      return;
    }

    const requestedJobStillExists = requestedJobID !== ""
      && selectableJobRecords.some((record) => record.job.id === requestedJobID);
    if (requestedJobStillExists && requestedJobID !== selectedJobID) {
      setSelectedJobID(requestedJobID);
      return;
    }

    const selectedJobStillExists = selectableJobRecords.some((record) => record.job.id === selectedJobID);
    if (!selectedJobStillExists) {
      setSelectedJobID(selectableJobRecords[0].job.id);
    }
  }, [requestedJobID, selectableJobRecords, selectedJobID]);

  const selectedRecord = useMemo(() => {
    return selectableJobRecords.find((record) => record.job.id === selectedJobID) ?? selectableJobRecords[0] ?? null;
  }, [selectableJobRecords, selectedJobID]);

  const { results, isLoading: isResultsLoading, error: resultsError } = useJobResults(selectedRecord?.job.id ?? "");
  const [roadsGeoJSON, setRoadsGeoJSON] = useState<FeatureCollection | null>(null);

  const satelliteTileUrl = useMemo(() => {
    const sceneID = selectedRecord?.job.result_refs?.scene_id;
    if (!sceneID) {
      return undefined;
    }
    return `${apiBaseUrl}/satellite/tiles/${sceneID}/{z}/{x}/{y}`;
  }, [selectedRecord?.job.result_refs?.scene_id]);

  useEffect(() => {
    if (!selectedJobID) {
      setRoadsGeoJSON(null);
      return;
    }

    let cancelled = false;
    apiClient.get<BackendJob>(`/jobs/${selectedJobID}`)
      .then((job) => {
        if (cancelled) {
          return;
        }

        const hasRoads = Boolean(job.result_refs?.downloads?.graph_geojson) && job.status === "completed";
        if (!hasRoads) {
          setRoadsGeoJSON(null);
          return;
        }

        return apiClient.get<FeatureCollection>(`/jobs/${selectedJobID}/layers/roads-geojson`);
      })
      .then((collection) => {
        if (cancelled || !collection) {
          return;
        }

        if (collection.type === "FeatureCollection") {
          setRoadsGeoJSON(collection);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoadsGeoJSON(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedJobID]);

  useEffect(() => {
    const selectedProjectStillExists = projects.some((project) => project.id === drawnRegionProjectID);
    if (selectedProjectStillExists) {
      return;
    }

    const fallbackProjectID = selectedRecord?.project.id ?? projects[0]?.id ?? "";
    if (fallbackProjectID !== drawnRegionProjectID) {
      setDrawnRegionProjectID(fallbackProjectID);
    }
  }, [drawnRegionProjectID, projects, selectedRecord?.project.id]);

  const connectivityMetrics = useMemo(() => {
    if (!isRecord(results?.connectivity?.metrics)) {
      return [];
    }

    return Object.entries(results.connectivity.metrics).slice(0, 6);
  }, [results]);

  const handleJobChange = (jobID: string): void => {
    setSelectedJobID(jobID);

    const nextParams = new URLSearchParams(searchParams);
    if (jobID) {
      nextParams.set("job", jobID);
    } else {
      nextParams.delete("job");
    }

    setSearchParams(nextParams, { replace: true });
  };

  const handleDrawnRegionChange = (polygon: Polygon | null): void => {
    setDrawnRegionPolygon(polygon);
    setDrawnRegionError(null);

    if (drawMode && polygon) {
      storeSatelliteUploadRegionSelection(polygon);
      navigate(uploadReturnPath, { replace: true });
    }
  };

  const handleSaveDrawnRegion = async (): Promise<void> => {
    if (!drawnRegionPolygon) {
      setDrawnRegionError("Finish drawing a region before saving it.");
      return;
    }

    if (projects.length === 0) {
      setDrawnRegionError("Create a project before saving a drawn region.");
      return;
    }

    if (!drawnRegionProjectID) {
      setDrawnRegionError("Select a project for the new region.");
      return;
    }

    if (!drawnRegionName.trim()) {
      setDrawnRegionError("Region name is required.");
      return;
    }

    setIsSavingDrawnRegion(true);
    setDrawnRegionError(null);

    try {
      const createdRegion = await createRegion(drawnRegionProjectID, drawnRegionName.trim(), drawnRegionPolygon);
      setDrawnRegionPolygon(null);
      setDrawnRegionName("");
      navigate(`/processing?region=${createdRegion.id}`);
    } catch (requestError: unknown) {
      setDrawnRegionError(requestError instanceof Error ? requestError.message : "Failed to save drawn region.");
    } finally {
      setIsSavingDrawnRegion(false);
    }
  };

  const pageError = regionsError ?? jobsError ?? resultsError ?? null;

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <h1 className="mb-6 text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {MapAnalysisPageCopy.title}
      </h1>

      {pageError ? (
        <div className="mb-4 rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {pageError}
        </div>
      ) : null}

      {drawMode ? (
        <div className="mb-4 rounded-[12px] border border-[color:var(--accent-green)]/25 bg-[color:var(--bg-card)] px-5 py-4 text-sm text-[color:var(--text-primary)]">
          Draw the satellite download area on the map. Click points to outline it, then click
          {" "}
          <span className="font-semibold">Finish Region</span>
          {" "}
          to return to the upload form.
        </div>
      ) : null}

      {isRegionsLoading ? (
        <div className="h-[clamp(540px,80vh,960px)] animate-pulse rounded-[2rem] border border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]" />
      ) : (
        <AssessmentMap
          regions={regions}
          guestMode={false}
          selectedRegionId={selectedRecord?.region.id ?? ""}
          results={results}
          roadsGeoJSON={roadsGeoJSON}
          satelliteTileUrl={satelliteTileUrl}
          isFullscreen={false}
          onDrawnRegionChange={handleDrawnRegionChange}
          initialActiveTool={drawMode ? "draw-region" : null}
          drawRegionReadyHint={
            drawMode
              ? "Region ready. Click Finish Region to return to the satellite upload form."
              : undefined
          }
        />
      )}

      {drawnRegionPolygon && !drawMode ? (
        <div className="mt-5 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end">
            <div className="xl:max-w-[420px]">
              <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Save Drawn Region</h2>
              <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
                <span className="font-semibold text-[color:var(--text-primary)]">Finish Region</span>
                {" "}
                only closes the outline on the map. Saving creates a real region record in your workspace and opens it in
                Processing Jobs.
              </p>
              {drawnRegionError ? (
                <div className="mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {drawnRegionError}
                </div>
              ) : null}
            </div>

            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="map-analysis-drawn-region-project" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                  Project
                </label>
                <select
                  id="map-analysis-drawn-region-project"
                  value={drawnRegionProjectID}
                  onChange={(event) => {
                    setDrawnRegionProjectID(event.target.value);
                    setDrawnRegionError(null);
                  }}
                  disabled={projects.length === 0 || isSavingDrawnRegion}
                  className="h-11 w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)] disabled:opacity-60"
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
                <label htmlFor="map-analysis-drawn-region-name" className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
                  Region name
                </label>
                <input
                  id="map-analysis-drawn-region-name"
                  value={drawnRegionName}
                  onChange={(event) => {
                    setDrawnRegionName(event.target.value);
                    setDrawnRegionError(null);
                  }}
                  placeholder="North survey block"
                  className="h-11 w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
                />
              </div>
            </div>

            <Button
              className="h-11 shrink-0 px-5"
              onClick={() => void handleSaveDrawnRegion()}
              disabled={isSavingDrawnRegion || projects.length === 0}
            >
              {isSavingDrawnRegion ? "Saving region..." : "Save Region & Open Processing"}
            </Button>
          </div>

          {projects.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
              Create a project on the Projects page before saving this outline.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5">
          <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Workspace Summary</h2>
          <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
            <div className="flex items-center justify-between">
              <span>Projects</span>
              <span className="font-semibold text-[color:var(--text-primary)]">{projects.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Regions</span>
              <span className="font-semibold text-[color:var(--text-primary)]">{regions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Completed Jobs</span>
              <span className="font-semibold text-[color:var(--text-primary)]">
                {jobRecords.filter((record) => record.job.status === "completed").length}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5">
          <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Analysis Selection</h2>
          {isJobsLoading ? (
            <div className="mt-4 h-11 animate-pulse rounded-[10px] bg-[color:var(--bg-primary)]" />
          ) : selectableJobRecords.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
              No jobs are available yet. Create a region and start a job from the processing page first.
            </p>
          ) : (
            <>
              <label htmlFor="map-analysis-job" className="mt-4 block text-sm font-medium text-[color:var(--text-primary)]">
                Job
              </label>
              <select
                id="map-analysis-job"
                value={selectedRecord?.job.id ?? ""}
                onChange={(event) => handleJobChange(event.target.value)}
                className="mt-2 h-11 w-full rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-sm text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
              >
                {selectableJobRecords.map((record) => (
                  <option key={record.job.id} value={record.job.id}>
                    {`${record.project.name} - ${record.region.name} - ${record.job.job_type} - ${formatDateTime(record.job.created_at)}`}
                  </option>
                ))}
              </select>

              {selectedRecord ? (
                <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
                  <div className="flex items-center justify-between">
                    <span>Project</span>
                    <span className="font-semibold text-[color:var(--text-primary)]">{selectedRecord.project.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Region</span>
                    <span className="font-semibold text-[color:var(--text-primary)]">{selectedRecord.region.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Job Type</span>
                    <span className="font-semibold text-[color:var(--text-primary)]">{selectedRecord.job.job_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Created</span>
                    <span className="font-semibold text-[color:var(--text-primary)]">{formatDateTime(selectedRecord.job.created_at)}</span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5">
          <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Loaded Overlays</h2>
          {selectedRecord === null ? (
            <p className="mt-4 text-sm text-[color:var(--text-secondary)]">
              Region boundaries are visible. Select a completed job to inspect its overlays when available.
            </p>
          ) : isResultsLoading ? (
            <div className="mt-4 h-24 animate-pulse rounded-[10px] bg-[color:var(--bg-primary)]" />
          ) : (
            <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
              <div className="flex items-center justify-between">
                <span>Segmentation</span>
                <span className="font-semibold text-[color:var(--text-primary)]">
                  {results?.segmentation ? "Loaded" : "Not available"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Classification</span>
                <span className="font-semibold text-[color:var(--text-primary)]">
                  {results?.classification.length ?? 0} feature{(results?.classification.length ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Connectivity</span>
                <span className="font-semibold text-[color:var(--text-primary)]">
                  {results?.connectivity ? "Loaded" : "Not available"}
                </span>
              </div>
            </div>
          )}
        </div>

        {connectivityMetrics.length > 0 ? (
          <div className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-5 py-5 xl:col-span-3">
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">Connectivity Metrics</h2>
            <div className="mt-4 grid gap-3 text-sm text-[color:var(--text-secondary)] md:grid-cols-2 xl:grid-cols-3">
              {connectivityMetrics.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-4 rounded-[10px] bg-[color:var(--bg-primary)] px-4 py-3">
                  <span className="truncate capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-[color:var(--text-primary)]">{formatMetricValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
