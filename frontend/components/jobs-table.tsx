"use client";

import Link from "next/link";

import type { JobSummary } from "@/lib/types";
import { formatDate, formatStage } from "@/lib/utils";
import { StatusPill } from "@/components/status-pill";

export function JobsTable({ jobs }: { jobs: JobSummary[] }) {
  if (!jobs.length) {
    return (
      <div className="empty-state">
        No assessments have been created yet. Start a new project from the Projects page to
        upload a Sentinel-2 GeoTIFF and launch the Roadlytics workflow.
      </div>
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Models</th>
          <th>Stage</th>
          <th>Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td>
              <strong>{job.project_name}</strong>
              <div className="helper">{job.description || "No description supplied."}</div>
            </td>
            <td>
              {job.segmenter} / {job.classifier}
            </td>
            <td>
              <div className="inline-row">
                <StatusPill status={job.status} />
                <span className="helper">{formatStage(job.stage)}</span>
              </div>
            </td>
            <td>{formatDate(job.updated_at)}</td>
            <td>
              <div className="table-actions">
                <Link href={`/processing?jobId=${job.id}`}>Processing</Link>
                <Link href={`/map?jobId=${job.id}`}>Map</Link>
                <Link href={`/reports?jobId=${job.id}`}>Report</Link>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

