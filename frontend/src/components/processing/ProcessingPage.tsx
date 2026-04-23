import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ActiveJobsCard } from "@/components/processing/ActiveJobsCard";
import { RegionSelectorCard } from "@/components/processing/RegionSelectorCard";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useReportRecords } from "@/hooks/useReportRecords";
import { useRegions } from "@/hooks/useRegions";
import { apiClient } from "@/lib/apiClient";
import type { BackendJob, BackendReport } from "@/types";

class ProcessingPageCopy {
  public static readonly title = "Run Assessment";
  public static readonly regionHint =
    "Select a region, choose a Sentinel-2 date range, and start an end-to-end road quality assessment.";
  public static readonly startDateLabel = "Start Date:";
  public static readonly endDateLabel = "End Date:";
  public static readonly cloudCoverLabel = "Max Cloud Cover:";
  public static readonly runButton = "Run Assessment";
  public static readonly runningButton = "Starting…";
}

export const ProcessingPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects, isLoading: isProjectsLoading, error: projectsError } = useProjects();
  const { regions, isLoading: isRegionsLoading, error: regionsError } = useRegions();
  const { records: jobRecords, isLoading: isJobsLoading, error: jobsError, refetch: refetchJobs } = useJobRecords();
  const { records: reportRecords, error: reportsError, refetch: refetchReports } = useReportRecords();

  const [selectedRegionID, setSelectedRegionID] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [maxCloudCover, setMaxCloudCover] = useState<number>(0.15);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [reportJobID, setReportJobID] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);

  const requestedRegionID = searchParams.get("region") ?? "";

  useEffect(() => {
    if (regions.length === 0) {
      return;
    }

    const requestedRegionStillExists =
      requestedRegionID !== "" && regions.some((region) => region.id === requestedRegionID);
    if (requestedRegionStillExists && requestedRegionID !== selectedRegionID) {
      setSelectedRegionID(requestedRegionID);
      return;
    }

    const selectedStillExists = regions.some((region) => region.id === selectedRegionID);
    if (!selectedStillExists) {
      setSelectedRegionID(regions[0].id);
    }
  }, [regions, requestedRegionID, selectedRegionID]);

  const regionOptions = useMemo(() => {
    return regions.map((region) => {
      const project = projects.find((item) => item.id === region.project_id);
      return {
        id: region.id,
        label: project ? `${project.name} • ${region.name}` : region.name,
      };
    });
  }, [projects, regions]);

  const selectedRegionJobs = useMemo(() => {
    return jobRecords
      .filter((record) => record.region.id === selectedRegionID)
      .map((record) => record.job)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [jobRecords, selectedRegionID]);

  const latestReportByJobID = useMemo(() => {
    const reports = new Map<string, string>();
    reportRecords.forEach((record) => {
      if (!reports.has(record.job.id)) {
        reports.set(record.job.id, record.report.id);
      }
    });
    return reports;
  }, [reportRecords]);

  const handleRunAssessment = (): void => {
    void (async () => {
      if (!selectedRegionID) {
        return;
      }

      setIsSubmitting(true);
      setActionError(null);

      try {
        await apiClient.post<BackendJob>("/jobs", {
          region_id: selectedRegionID,
          job_type: "full",
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          max_cloud_cover: maxCloudCover,
          resolution_m: 10,
        });
        await refetchJobs();
      } catch (requestError: unknown) {
        setActionError(requestError instanceof Error ? requestError.message : "Failed to create job.");
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleGenerateReport = async (jobID: string): Promise<void> => {
    setReportJobID(jobID);
    setActionError(null);

    try {
      const report = await apiClient.post<BackendReport>(`/jobs/${jobID}/reports`, {
        report_type: "PDF",
      });
      await refetchReports();
      navigate(`/reports/${report.id}`);
    } catch (requestError: unknown) {
      setActionError(requestError instanceof Error ? requestError.message : "Failed to generate report.");
    } finally {
      setReportJobID("");
    }
  };

  const jobRows = selectedRegionJobs.map((job) => ({
    id: job.id,
    typeLabel: job.job_type,
    status: job.status,
    progress: job.progress,
    errorMessage: job.error_message ?? null,
    reportRoute: latestReportByJobID.get(job.id) ? `/reports/${latestReportByJobID.get(job.id)}` : null,
    canGenerateReport: job.status === "completed" && !latestReportByJobID.has(job.id),
    isGeneratingReport: reportJobID === job.id,
    onGenerateReport: () => {
      void handleGenerateReport(job.id);
    },
    mapRoute: job.status === "completed" ? `/map-analysis?job=${job.id}` : null,
  }));

  const pageError = projectsError ?? regionsError ?? jobsError ?? reportsError ?? actionError ?? null;

  const isFormDisabled = isProjectsLoading || isRegionsLoading || isSubmitting || !selectedRegionID;

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <h1 className="mb-2 text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {ProcessingPageCopy.title}
      </h1>
      <p className="mb-6 max-w-[760px] text-sm text-[color:var(--text-secondary)]">
        {ProcessingPageCopy.regionHint}
      </p>

      {pageError ? (
        <div className="mb-4 max-w-[680px] rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {pageError}
        </div>
      ) : null}

      <div className="flex max-w-[680px] flex-col gap-4">
        <RegionSelectorCard
          regions={regionOptions}
          selectedRegionId={selectedRegionID}
          onChange={setSelectedRegionID}
          disabled={isProjectsLoading || isRegionsLoading}
        />

        <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--text-primary)]">Assessment Parameters</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
                {ProcessingPageCopy.startDateLabel}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); }}
                disabled={isSubmitting}
                className="h-10 w-full rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-green)] disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--text-secondary)]">
                {ProcessingPageCopy.endDateLabel}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); }}
                disabled={isSubmitting}
                className="h-10 w-full rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-3 text-sm text-[color:var(--text-primary)] outline-none transition-colors focus:border-[color:var(--accent-green)] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-[color:var(--text-secondary)]">
              <span>{ProcessingPageCopy.cloudCoverLabel}</span>
              <span className="font-mono text-[color:var(--text-primary)]">
                {Math.round(maxCloudCover * 100)}%
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={maxCloudCover}
              onChange={(e) => { setMaxCloudCover(Number(e.target.value)); }}
              disabled={isSubmitting}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--border-subtle)] accent-[color:var(--accent-green)] disabled:opacity-50"
            />
            <div className="mt-1 flex justify-between text-[10px] text-[color:var(--text-secondary)]">
              <span>0%</span>
              <span>30%</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunAssessment}
            disabled={isFormDisabled}
            className="mt-5 w-full rounded-[8px] bg-[color:var(--accent-green)] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? ProcessingPageCopy.runningButton : ProcessingPageCopy.runButton}
          </button>
        </section>

        <ActiveJobsCard jobs={jobRows} isLoading={isJobsLoading} error={jobsError} />
      </div>
    </section>
  );
};
