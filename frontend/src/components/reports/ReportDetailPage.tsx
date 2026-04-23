import { ChevronLeft, Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useReportRecords } from "@/hooks/useReportRecords";
import { apiClient } from "@/lib/apiClient";
import type { BackendReport, Report } from "@/types";
import { normalizeReport } from "@/types";

class ReportDetailPageCopy {
  public static readonly backLabel = "Back to Reports";
  public static readonly missingTitle = "Report Not Found";
  public static readonly readyMessage = "This report is stored in platform storage and ready for download.";
  public static readonly unavailableMessage = "The report record exists, but a signed download link is not available yet.";
  public static readonly downloadLabel = "Download Report";
  public static readonly deleteLabel = "Delete Report";
  public static readonly deletingLabel = "Deleting...";
  public static readonly deleteConfirm = "Delete this report permanently?";
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const ReportDetailPage = (): JSX.Element => {
  const navigate = useNavigate();
  const params = useParams();
  const reportID = params.id ?? "";
  const { records, error: recordsError, refetch } = useReportRecords();
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportID) {
      setIsLoading(false);
      setReport(null);
      setError("Report not found.");
      return;
    }

    let isMounted = true;

    const loadReport = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const nextReport = await apiClient.get<BackendReport>(`/reports/${reportID}`);
        if (!isMounted) {
          return;
        }

        setReport(normalizeReport(nextReport));
      } catch (requestError: unknown) {
        if (!isMounted) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Failed to load report.");
        setReport(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      isMounted = false;
    };
  }, [reportID]);

  const record = records.find((item) => item.report.id === reportID) ?? null;
  const metadataLabel = record
    ? `${record.project.name} • ${record.region.name}`
    : report
      ? `Job ${report.job_id.slice(0, 8)}`
      : "Loading report metadata...";

  const handleDelete = async (): Promise<void> => {
    if (!reportID || !window.confirm(ReportDetailPageCopy.deleteConfirm)) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await apiClient.delete<{ message?: string }>(`/reports/${reportID}`);
      await refetch();
      navigate("/reports", { replace: true });
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete report.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <Link
        to="/reports"
        className="mb-5 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] transition-colors duration-150 hover:text-[color:var(--text-primary)]"
      >
        <ChevronLeft size={16} />
        <span>{ReportDetailPageCopy.backLabel}</span>
      </Link>

      <h1 className="text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {report ? `${report.report_type} Report` : ReportDetailPageCopy.missingTitle}
      </h1>
      <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
        {metadataLabel}
      </p>

      {recordsError || error ? (
        <div className="mt-6 rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {error ?? recordsError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="mt-8 h-[360px] animate-pulse rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]" />
      ) : report ? (
        <div className="mt-8 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">Report Type</p>
              <p className="mt-2 text-sm text-[color:var(--text-primary)]">{report.report_type}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">Created At</p>
              <p className="mt-2 text-sm text-[color:var(--text-primary)]">{formatDate(report.created_at)}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">File Path</p>
              <p className="mt-2 break-all text-sm text-[color:var(--text-primary)]">{report.file_path}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">Job</p>
              <p className="mt-2 break-all text-sm text-[color:var(--text-primary)]">{record?.job.id ?? report.job_id}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">Project</p>
              <p className="mt-2 text-sm text-[color:var(--text-primary)]">{record?.project.name ?? "Unavailable"}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-nav-label)]">Region</p>
              <p className="mt-2 text-sm text-[color:var(--text-primary)]">{record?.region.name ?? "Unavailable"}</p>
            </div>
          </div>

          <div className="mt-8 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-6 py-5">
            <p className="text-sm text-[color:var(--text-secondary)]">
              {report.signed_url ? ReportDetailPageCopy.readyMessage : ReportDetailPageCopy.unavailableMessage}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {report.signed_url ? (
                <a
                  href={report.signed_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[8px] bg-[color:var(--accent-green)] px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
                >
                  <Download size={16} />
                  <span>{ReportDetailPageCopy.downloadLabel}</span>
                </a>
              ) : null}

              {record ? (
                <>
                  <Link
                    to={`/processing?region=${record.region.id}`}
                    className="rounded-[8px] border border-[color:var(--border-subtle)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)]"
                  >
                    Open Processing
                  </Link>
                  <Link
                    to={`/map-analysis?job=${record.job.id}`}
                    className="rounded-[8px] border border-[color:var(--border-subtle)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)]"
                  >
                    Open Map Analysis
                  </Link>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-[8px] border border-red-500/40 px-5 py-2.5 text-sm font-semibold text-red-300 transition-colors duration-150 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={16} />
                <span>{isDeleting ? ReportDetailPageCopy.deletingLabel : ReportDetailPageCopy.deleteLabel}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-6 text-sm text-[color:var(--text-secondary)]">
          The requested report could not be loaded.
        </div>
      )}
    </section>
  );
};
