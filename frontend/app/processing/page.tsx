"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { getJob, listJobs } from "@/lib/api";
import type { JobDetail } from "@/lib/types";
import { formatBytes, formatDate, formatStage } from "@/lib/utils";

function ProcessingPageContent() {
  const searchParams = useSearchParams();
  const initialJobId = searchParams.get("jobId");

  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialJobId) {
      setJobId(initialJobId);
      return;
    }
    let cancelled = false;
    listJobs(10)
      .then((response) => {
        if (!cancelled) {
          const next =
            response.jobs.find((candidate) => candidate.status === "running") ??
            response.jobs.find((candidate) => candidate.status === "queued") ??
            response.jobs[0];
          setJobId(next?.id ?? null);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load jobs.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialJobId]);

  useEffect(() => {
    if (!jobId) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const nextJob = await getJob(jobId);
        if (cancelled) {
          return;
        }
        setJob(nextJob);
        setError(null);
        if (nextJob.status === "running" || nextJob.status === "queued") {
          timer = setTimeout(load, 4000);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load the job.");
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Processing</h1>
          <p>
            Follow validation, segmentation, condition classification, connectivity analytics,
            and packaging in one continuous timeline.
          </p>
        </div>
        {job ? <StatusPill status={job.status} /> : null}
      </div>

      {!job && !error ? (
        <div className="empty-state">
          No active job is selected. Start a new assessment from the Projects page, or add
          `?jobId=...` to inspect a specific run.
        </div>
      ) : null}

      {error ? <div className="error-text">{error}</div> : null}

      {job ? (
        <div className="grid grid-2">
          <article className="card">
            <span className="eyebrow">Active Job</span>
            <h2 style={{ margin: "8px 0 10px", fontFamily: "var(--font-serif)" }}>
              {job.project_name}
            </h2>
            <p className="helper">{job.description || "No description supplied."}</p>

            <div className="metric-grid" style={{ marginTop: 18 }}>
              <div className="mini-metric">
                <span>Progress</span>
                <strong>{job.progress}%</strong>
              </div>
              <div className="mini-metric">
                <span>Stage</span>
                <strong style={{ fontSize: "1.2rem" }}>{formatStage(job.stage)}</strong>
              </div>
              <div className="mini-metric">
                <span>Models</span>
                <strong style={{ fontSize: "1.1rem" }}>
                  {job.segmenter} / {job.classifier}
                </strong>
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                height: 12,
                borderRadius: 999,
                background: "rgba(115, 86, 58, 0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${job.progress}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #b8763e, #dca771)",
                }}
              />
            </div>

            <div className="button-row" style={{ marginTop: 18 }}>
              <Link className="button secondary" href={`/map?jobId=${job.id}`}>
                Open Map
              </Link>
              <Link className="button secondary" href={`/reports?jobId=${job.id}`}>
                Open Report
              </Link>
            </div>

            {job.artifacts.length ? (
              <>
                <h3 style={{ marginTop: 26 }}>Available Downloads</h3>
                <div className="timeline">
                  {job.artifacts.filter((artifact) => artifact.is_download).map((artifact) => (
                    <div className="timeline-item" key={artifact.id}>
                      <div className="timeline-dot" />
                      <div className="timeline-copy">
                        <strong>{artifact.label}</strong>
                        <div className="helper">
                          {artifact.filename} - {formatBytes(artifact.size_bytes)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <article className="card">
            <span className="eyebrow">Timeline</span>
            <h2 style={{ margin: "8px 0 16px", fontFamily: "var(--font-serif)" }}>
              Job events
            </h2>
            <div className="timeline">
              {job.events.map((event, index) => (
                <div className="timeline-item" key={`${event.created_at}-${index}`}>
                  <div className="timeline-dot" />
                  <div className="timeline-copy">
                    <strong>{formatStage(event.stage)}</strong>
                    <div className="helper">{event.message}</div>
                    <div className="footer-note">{formatDate(event.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="empty-state">Loading processing view...</div>}>
      <ProcessingPageContent />
    </Suspense>
  );
}
