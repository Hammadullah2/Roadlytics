import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useReportRecords } from "@/hooks/useReportRecords";
import { useRegions } from "@/hooks/useRegions";
import type { BackendJob, BackendReport } from "@/types";
import { apiClient } from "@/lib/apiClient";
import { useState } from "react";

function CheckIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function XIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function ClockIcon({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function ActivityIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
}
function MapPinIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function FileTextIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;
}

function getStatusPill(status: string): JSX.Element {
  if (status === "completed") return <span className="pill pill-success"><CheckIcon />Completed</span>;
  if (status === "running") return <span className="pill pill-warning"><span className="dot" />Running</span>;
  if (status === "failed") return <span className="pill pill-danger"><XIcon />Failed</span>;
  return <span className="pill pill-neutral"><ClockIcon />Queued</span>;
}

const formatRelative = (isoDate: string): string => {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
};

type StageStatus = "done" | "running" | "queued";

interface PipelineStageInfo {
  id: string; label: string; desc: string;
  status: StageStatus; pct?: number;
}

function derivePipelineStages(job: BackendJob): PipelineStageInfo[] {
  const p = job.progress ?? 0;
  const done = job.status === "completed";
  const failed = job.status === "failed";

  if (done) {
    return [
      { id: "ingest", label: "Ingest & Validation", desc: "GeoTIFF read · CRS check · band integrity", status: "done" },
      { id: "seg", label: "Road Segmentation", desc: "Segmentation model · binary road mask", status: "done" },
      { id: "cls", label: "Condition Classification", desc: "Condition model · good / damaged / unpaved", status: "done" },
      { id: "net", label: "Network Analysis", desc: "Connected components · betweenness centrality", status: "done" },
      { id: "rpt", label: "Report Generation", desc: "Aggregate stats · PDF + CSV export", status: "done" },
    ];
  }

  const stages = [
    { id: "ingest", label: "Ingest & Validation", desc: "GeoTIFF read · CRS check · band integrity", threshold: 10 },
    { id: "seg", label: "Road Segmentation", desc: "Segmentation model · binary road mask", threshold: 35 },
    { id: "cls", label: "Condition Classification", desc: "Condition model · good / damaged / unpaved", threshold: 65 },
    { id: "net", label: "Network Analysis", desc: "Connected components · betweenness centrality", threshold: 85 },
    { id: "rpt", label: "Report Generation", desc: "Aggregate stats · PDF + CSV export", threshold: 100 },
  ];

  return stages.map((s, i) => {
    const prevThreshold = i === 0 ? 0 : stages[i - 1].threshold;
    if (p >= s.threshold) return { ...s, status: "done" as StageStatus };
    if (p > prevThreshold) {
      const stagePct = Math.round((p - prevThreshold) / (s.threshold - prevThreshold) * 100);
      return { ...s, status: "running" as StageStatus, pct: failed ? p : stagePct };
    }
    return { ...s, status: "queued" as StageStatus };
  });
}

export const ProcessingPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects } = useProjects();
  const { regions } = useRegions();
  const { records: jobRecords, isLoading: isJobsLoading } = useJobRecords();
  const { records: reportRecords, refetch: refetchReports } = useReportRecords();
  const [reportJobID, setReportJobID] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const requestedJobID = searchParams.get("job") ?? "";

  const allJobs = useMemo(() => {
    return jobRecords
      .map((rec) => {
        const project = projects.find((p) => p.id === rec.project.id);
        const region = regions.find((r) => r.id === rec.region.id);
        return {
          job: rec.job,
          projectName: project?.name ?? rec.project.name ?? "Unknown project",
          regionName: region?.name ?? rec.region.name ?? "Unknown region",
        };
      })
      .sort((a, b) => new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime());
  }, [jobRecords, projects, regions]);

  const currentRun = useMemo(() => {
    // Prefer the job from URL param, then latest running, then latest pending
    if (requestedJobID) {
      const found = allJobs.find((j) => j.job.id === requestedJobID);
      if (found) return found;
    }
    return allJobs.find((j) => j.job.status === "running") ??
      allJobs.find((j) => j.job.status === "pending") ??
      allJobs[0] ?? null;
  }, [allJobs, requestedJobID]);

  const latestReportByJobID = useMemo(() => {
    const map = new Map<string, string>();
    reportRecords.forEach((rec) => { if (!map.has(rec.job.id)) map.set(rec.job.id, rec.report.id); });
    return map;
  }, [reportRecords]);

  const handleReport = async (jobID: string): Promise<void> => {
    setReportJobID(jobID);
    setActionError(null);
    try {
      const report = await apiClient.post<BackendReport>(`/jobs/${jobID}/reports`, { report_type: "PDF" });
      await refetchReports();
      navigate(`/reports/${report.id}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReportJobID("");
    }
  };

  const stages = currentRun ? derivePipelineStages(currentRun.job) : [];
  const totalDone = stages.filter((s) => s.status === "done").length;
  const runningStage = stages.find((s) => s.status === "running");
  const overallPct = currentRun
    ? (currentRun.job.status === "completed" ? 100 : (currentRun.job.progress ?? 0))
    : 0;

  return (
    <div>
      <div className="row space-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Processing</h1>
          <div className="muted" style={{ marginTop: 4 }}>Monitor your batch pipeline runs and queued jobs.</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {currentRun && (currentRun.job.status === "running" || currentRun.job.status === "pending") && (
            <span className="pill pill-accent"><ActivityIcon /><span className="dot" />Pipeline Active · {overallPct}%</span>
          )}
          <button className="btn btn-secondary btn-sm"><DownloadIcon />Export logs</button>
        </div>
      </div>

      {actionError && (
        <div style={{ marginBottom: 16, padding: "12px 16px", borderRadius: "var(--radius-btn)", background: "color-mix(in srgb, var(--danger) 10%, white)", color: "var(--danger)", fontSize: 14, border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
          {actionError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "58fr 42fr", gap: 20 }}>
        {/* Left: current run */}
        <div>
          {isJobsLoading && (
            <div style={{ height: 120, borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-secondary)", marginBottom: 16 }} />
          )}

          {!isJobsLoading && !currentRun && (
            <div className="card card-pad" style={{ marginBottom: 16, textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🚀</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No pipeline runs yet</div>
              <div style={{ fontSize: 13 }}>Create a new project and upload a GeoTIFF to get started.</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => navigate("/upload")}>
                New Project
              </button>
            </div>
          )}

          {currentRun && (
            <>
              <div className="card card-pad" style={{ marginBottom: 16 }}>
                <div className="row space-between" style={{ marginBottom: 4 }}>
                  <div>
                    <div className="section-label" style={{ margin: 0 }}>Current Run</div>
                    <h3 style={{ marginTop: 4 }}>{currentRun.projectName}</h3>
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {currentRun.job.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14, marginBottom: 16 }}>
                  {[
                    { label: "Region", value: currentRun.regionName },
                    { label: "Job type", value: currentRun.job.job_type },
                    { label: "ETA", value: currentRun.job.status === "completed" ? "Done" : "~4–12 min" },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ height: 8, background: "var(--bg-tertiary)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ width: `${overallPct}%`, height: "100%", background: currentRun.job.status === "failed" ? "var(--danger)" : "var(--accent)", transition: "width .4s" }} />
                </div>
                <div className="row space-between">
                  <span className="muted" style={{ fontSize: 12 }}>
                    {currentRun.job.status === "completed"
                      ? "All stages complete"
                      : runningStage
                        ? `Stage ${totalDone + 1} of ${stages.length} · ${runningStage.label}`
                        : currentRun.job.status}
                  </span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{overallPct}%</span>
                </div>
              </div>

              <div className="section-label">Pipeline Stages</div>
              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
                {stages.map((s, i) => {
                  const color = s.status === "done" ? "var(--success)" : s.status === "running" ? "var(--warning)" : "var(--text-secondary)";
                  const bg = s.status === "done" ? "color-mix(in srgb, var(--success) 15%, white)" : s.status === "running" ? "color-mix(in srgb, var(--warning) 18%, white)" : "var(--bg-tertiary)";
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px", borderBottom: i < stages.length - 1 ? "1px solid var(--border)" : "none", background: s.status === "running" ? "var(--bg-primary)" : "transparent" }}>
                      <div style={{ position: "relative", flexShrink: 0, paddingTop: 2 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {s.status === "done" ? <CheckIcon size={14} /> : <span style={{ fontSize: 12 }}>{i + 1}</span>}
                        </div>
                        {i < stages.length - 1 && (
                          <div style={{ position: "absolute", left: "50%", top: 32, width: 2, height: 14, marginLeft: -1, background: stages[i + 1].status === "queued" ? "var(--border)" : "var(--success)" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row space-between">
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                          {s.status === "done" && <span className="pill pill-success"><CheckIcon size={11} />Done</span>}
                          {s.status === "running" && <span className="pill pill-warning"><span className="dot" />Running {s.pct !== undefined ? `· ${s.pct}%` : ""}</span>}
                          {s.status === "queued" && <span className="pill pill-neutral"><ClockIcon size={11} />Queued</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{s.desc}</div>
                        {s.status === "running" && s.pct !== undefined && (
                          <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
                            <div style={{ width: `${s.pct}%`, height: "100%", background: "var(--warning)", transition: "width .3s" }} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/map-analysis?job=${currentRun.job.id}`)}>
                  <MapPinIcon />View on Map
                </button>
                {currentRun.job.status === "completed" && !latestReportByJobID.has(currentRun.job.id) && (
                  <button className="btn btn-primary btn-sm" onClick={() => void handleReport(currentRun.job.id)} disabled={reportJobID === currentRun.job.id}>
                    <FileTextIcon />{reportJobID === currentRun.job.id ? "Generating…" : "Generate Report"}
                  </button>
                )}
                {latestReportByJobID.has(currentRun.job.id) && (
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/reports/${latestReportByJobID.get(currentRun.job.id)}`)}>
                    <FileTextIcon />View Report
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: active jobs list */}
        <div>
          <div className="row space-between" style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ margin: 0 }}>Active Jobs</div>
            <span className="muted" style={{ fontSize: 12 }}>{allJobs.length} total</span>
          </div>

          {isJobsLoading ? (
            <div className="stack" style={{ gap: 10 }}>
              {["s1", "s2"].map((k) => (
                <div key={k} style={{ height: 90, borderRadius: "var(--radius-card)", border: "1px solid var(--border)", background: "var(--bg-secondary)" }} />
              ))}
            </div>
          ) : allJobs.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--radius-card)", color: "var(--text-secondary)", fontSize: 13 }}>
              No jobs yet.
            </div>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {allJobs.map(({ job, projectName, regionName }) => {
                const color = job.status === "running" ? "var(--warning)" : job.status === "completed" ? "var(--success)" : job.status === "failed" ? "var(--danger)" : "var(--text-secondary)";
                const hasReport = latestReportByJobID.has(job.id);
                const canGenerateReport = job.status === "completed" && !hasReport;
                const reportRoute = hasReport ? `/reports/${latestReportByJobID.get(job.id)}` : null;
                const isCurrent = currentRun?.job.id === job.id;

                return (
                  <div key={job.id} className="card card-pad" style={{ borderLeft: `3px solid ${color}`, opacity: isCurrent ? 1 : 0.85 }}>
                    <div className="row space-between" style={{ marginBottom: 4 }}>
                      <div className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{job.id.slice(0, 8).toUpperCase()}</div>
                      {getStatusPill(job.status)}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{projectName}</div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{regionName} · Full Pipeline</div>
                    {(job.status === "running" || job.status === "failed") && typeof job.progress === "number" && (
                      <div style={{ height: 5, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                        <div style={{ width: `${job.progress}%`, height: "100%", background: color, transition: "width .4s" }} />
                      </div>
                    )}
                    <div className="row space-between">
                      <span className="muted" style={{ fontSize: 12 }}>{formatRelative(job.created_at)}</span>
                      <div className="row" style={{ gap: 6 }}>
                        {reportRoute && (
                          <button className="btn btn-ghost btn-sm" onClick={() => navigate(reportRoute)} style={{ padding: "4px 8px", fontSize: 12 }}>
                            <MapPinIcon />View
                          </button>
                        )}
                        {canGenerateReport && (
                          <button className="btn btn-secondary btn-sm" onClick={() => void handleReport(job.id)} disabled={reportJobID === job.id} style={{ padding: "4px 8px", fontSize: 12 }}>
                            <FileTextIcon />{reportJobID === job.id ? "…" : "Report"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
