"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { JobsTable } from "@/components/jobs-table";
import { listJobs } from "@/lib/api";
import type { JobsResponse } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listJobs(12)
      .then((response) => {
        if (!cancelled) {
          setData(response);
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
  }, []);

  const jobs = data?.jobs ?? [];
  const latestCompleted = jobs.find((job) => job.status === "completed");
  const counts = data?.counts ?? { total: 0, running: 0, completed: 0, failed: 0 };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Road condition intelligence, mapped into one workspace.</h1>
          <p>
            Track uploads, active inference, map-ready road condition masks, and connectivity
            outputs without leaving the project shell.
          </p>
        </div>
        <div className="header-chip">No-auth MVP - Azure-ready</div>
      </div>

      <section className="grid grid-3">
        <article className="card stat-card">
          <span className="eyebrow">Assessments</span>
          <strong>{counts.total ?? 0}</strong>
          <p>Total Roadlytics runs tracked in the current backend workspace.</p>
        </article>
        <article className="card stat-card">
          <span className="eyebrow">Live Jobs</span>
          <strong>{counts.running ?? 0}</strong>
          <p>Queued or processing jobs currently moving through validation and inference.</p>
        </article>
        <article className="card stat-card">
          <span className="eyebrow">Completed Results</span>
          <strong>{counts.completed ?? 0}</strong>
          <p>Assessments ready for map analysis, reporting, and file downloads.</p>
        </article>
      </section>

      <section className="grid grid-2" style={{ marginTop: 18 }}>
        <article className="card">
          <div className="page-header" style={{ marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Recent Assessments</h2>
              <p>The latest Roadlytics jobs across upload, processing, and completed states.</p>
            </div>
          </div>
          {error ? <div className="error-text">{error}</div> : <JobsTable jobs={jobs.slice(0, 6)} />}
        </article>

        <article className="card">
          <span className="eyebrow">Quick Actions</span>
          <h2 style={{ margin: "8px 0 12px", fontFamily: "var(--font-serif)" }}>
            Move from raw imagery to insight
          </h2>
          <p className="helper">
            Use the project workflow to upload a new scene, check processing progress, inspect
            overlays on the map, and open the generated HTML report.
          </p>
          <div className="button-row" style={{ marginTop: 18 }}>
            <Link className="button primary" href="/projects">
              New Assessment
            </Link>
            <Link className="button secondary" href="/processing">
              View Processing
            </Link>
            <Link
              className="button secondary"
              href={latestCompleted ? `/map?jobId=${latestCompleted.id}` : "/map"}
            >
              Open Map Analysis
            </Link>
          </div>
          <div className="footer-note">
            {latestCompleted
              ? `Latest completed assessment: ${latestCompleted.project_name}.`
              : "Create an assessment to unlock map and report views."}
          </div>
        </article>
      </section>
    </>
  );
}
