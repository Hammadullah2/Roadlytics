"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getJob, listJobs } from "@/lib/api";
import type { JobDetail } from "@/lib/types";

const MapAnalysis = dynamic(() => import("@/components/map-analysis"), {
  ssr: false,
});

function MapPageContent() {
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
    listJobs(25)
      .then((response) => {
        if (!cancelled) {
          setJobId(response.jobs.find((candidate) => candidate.status === "completed")?.id ?? null);
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
    getJob(jobId)
      .then((response) => {
        if (!cancelled) {
          setJob(response);
        }
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load the job.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Map Analysis</h1>
          <p>
            Inspect the uploaded Sentinel RGB image, condition-specific masks, combined
            classification, connectivity outputs, and critical junctions over a permanent OSM
            base layer.
          </p>
        </div>
        <div className="header-chip">OSM base locked on</div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}

      {!job ? (
        <div className="empty-state">
          No completed assessment is selected yet. Finish a run first, then open the map using
          the job action links or `?jobId=...`.
        </div>
      ) : (
        <MapAnalysis job={job} />
      )}
    </>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="empty-state">Loading map analysis...</div>}>
      <MapPageContent />
    </Suspense>
  );
}
