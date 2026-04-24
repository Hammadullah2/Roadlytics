import { JobRow, type ProcessingJobRowData } from "@/components/processing/JobRow";

type ActiveJobsCardProps = {
  jobs: ProcessingJobRowData[];
  isLoading: boolean;
  error: string | null;
};

class ActiveJobsCardCopy {
  public static readonly title = "Active Jobs:";
}

export const ActiveJobsCard = ({
  jobs,
  isLoading,
  error,
}: ActiveJobsCardProps): JSX.Element => {
  return (
    <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <h2 className="mb-3.5 text-sm font-semibold text-[color:var(--text-primary)]">
        {ActiveJobsCardCopy.title}
      </h2>

      <div className="space-y-3">
        {isLoading ? (
          ["job-skeleton-1", "job-skeleton-2"].map((item) => (
            <div
              key={item}
              className="h-[62px] animate-pulse rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)]"
            />
          ))
        ) : error ? (
          <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-[color:var(--text-secondary)]">No jobs have been started for this region yet.</p>
        ) : (
          jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))
        )}
      </div>
    </section>
  );
};
