"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { JobsTable } from "@/components/jobs-table";
import { NewAssessmentForm } from "@/components/new-assessment-form";
import { listJobs } from "@/lib/api";
import type { JobsResponse } from "@/lib/types";

export default function ProjectsPage() {
  const router = useRouter();
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listJobs(50)
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>
            Create a new assessment from a Sentinel-2 GeoTIFF, or reopen an existing project to
            continue from processing, map analysis, or reporting.
          </p>
        </div>
        <div className="header-chip">Sentinel-2 L2 - GeoTIFF - B2/B3/B4/B8</div>
      </div>

      <div className="grid grid-2">
        <article className="card">
          <div className="page-header" style={{ marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontFamily: "var(--font-serif)" }}>Assessment Library</h2>
              <p>Every job in the backend database, newest first.</p>
            </div>
          </div>
          {error ? <div className="error-text">{error}</div> : <JobsTable jobs={data?.jobs ?? []} />}
        </article>

        <NewAssessmentForm onCreated={(jobId) => router.push(`/processing?jobId=${jobId}`)} />
      </div>
    </>
  );
}
