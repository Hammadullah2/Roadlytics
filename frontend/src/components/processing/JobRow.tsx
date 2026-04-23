import { ProgressBar } from "@/components/processing/ProgressBar";
import { useJobRealtime } from "@/hooks/useJobRealtime";
import { useJobWebSocket } from "@/hooks/useJobWebSocket";
import { Link } from "react-router-dom";
import type { JobStatus, PipelineStage } from "@/types";

export type ProcessingJobRowData = {
  id: string;
  typeLabel: string;
  status: JobStatus;
  progress: number;
  errorMessage: string | null;
  reportRoute?: string | null;
  mapRoute?: string | null;
  canGenerateReport?: boolean;
  isGeneratingReport?: boolean;
  onGenerateReport?: () => void;
};

type JobRowProps = {
  job: ProcessingJobRowData;
};

class JobRowCopy {
  public static readonly jobPrefix = "Job";
  public static readonly separator = "|";
  public static readonly reportLabel = "Open Report";
  public static readonly mapLabel = "Open Map";
  public static readonly generateReportLabel = "Generate PDF Report";
  public static readonly generatingReportLabel = "Generating Report...";
}

const deriveStage = (progress: number, status: JobStatus): PipelineStage => {
  if (status === "completed") {
    return "connectivity";
  }

  if (progress >= 66) {
    return "connectivity";
  }

  if (progress >= 33) {
    return "classification";
  }

  return "segmentation";
};

const statusColor = (status: JobStatus): string => {
  switch (status) {
    case "completed":
      return "#2ea043";
    case "failed":
      return "#f85149";
    case "running":
      return "#388bfd";
    default:
      return "#8b949e";
  }
};

const statusLabel = (status: JobStatus, progress: number): string => {
  if (status === "completed") {
    return "Completed";
  }

  if (status === "failed") {
    return "Failed";
  }

  if (status === "running") {
    return `Progress: ${progress}%`;
  }

  return "Pending";
};

const stageLabel = (stage: PipelineStage, status: JobStatus): string => {
  if (status === "completed") {
    return "Processing complete";
  }

  if (status === "failed") {
    return "Processing failed";
  }

  switch (stage) {
    case "classification":
      return "Classification in progress";
    case "connectivity":
      return "Connectivity analysis in progress";
    default:
      return "Segmentation in progress";
  }
};

export const JobRow = ({ job }: JobRowProps): JSX.Element => {
  const liveJobID = job.status === "pending" || job.status === "running" ? job.id : "";
  const ws = useJobWebSocket(liveJobID);
  const realtime = useJobRealtime(liveJobID);
  const liveProgress = liveJobID && ws.isConnected ? ws.progress : realtime.job?.progress ?? job.progress;
  const liveStatus = liveJobID && ws.isConnected ? ws.status : realtime.job?.status ?? job.status;
  const liveStage = liveJobID && ws.isConnected ? ws.stage : deriveStage(liveProgress, liveStatus);
  const liveError = ws.error ?? realtime.job?.error_message ?? job.errorMessage ?? null;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span
            className="text-[8px]"
            style={{ color: statusColor(liveStatus) }}
          >
            ●
          </span>
          <span className="text-sm font-semibold text-[color:var(--text-primary)]">
            {`${JobRowCopy.jobPrefix} ${job.id.slice(0, 8)}`}
          </span>
          <span className="text-sm text-[color:var(--border-subtle)]">
            {JobRowCopy.separator}
          </span>
          <span className="text-sm text-[color:var(--text-secondary)]">
            {job.typeLabel}
          </span>
        </div>

        <span
          className={`text-sm ${liveStatus === "completed" || liveStatus === "failed" ? "font-semibold" : "font-normal"}`}
          style={{ color: statusColor(liveStatus) }}
        >
          {statusLabel(liveStatus, liveProgress)}
        </span>
      </div>

      {(liveStatus === "pending" || liveStatus === "running") ? <ProgressBar value={liveProgress} /> : null}
      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--text-nav-label)]">
        {stageLabel(liveStage, liveStatus)}
      </p>
      {liveError ? (
        <p className="mt-2 text-xs text-red-300">{liveError}</p>
      ) : null}
      {(job.reportRoute || job.mapRoute || (job.canGenerateReport && job.onGenerateReport)) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {job.reportRoute ? (
            <Link
              to={job.reportRoute}
              className="rounded-[8px] bg-[color:var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
            >
              {JobRowCopy.reportLabel}
            </Link>
          ) : job.canGenerateReport && job.onGenerateReport ? (
            <button
              type="button"
              onClick={job.onGenerateReport}
              disabled={job.isGeneratingReport}
              className="rounded-[8px] bg-[color:var(--accent-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {job.isGeneratingReport ? JobRowCopy.generatingReportLabel : JobRowCopy.generateReportLabel}
            </button>
          ) : null}

          {job.mapRoute ? (
            <Link
              to={job.mapRoute}
              className="rounded-[8px] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-primary)]"
            >
              {JobRowCopy.mapLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
