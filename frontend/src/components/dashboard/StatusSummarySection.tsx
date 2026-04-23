import { SectionHeading } from "@/components/shared/SectionHeading";
import { StatusItem } from "@/models/StatusItem";

class StatusSummaryCopy {
  public static readonly title = "Status Summary";
}

class SkeletonRegistry {
  public static readonly lineIds: string[] = ["line-1", "line-2", "line-3"];
}

type StatusSummarySectionProps = {
  items: StatusItem[];
  loading: boolean;
  error: string | null;
};

export const StatusSummarySection = ({
  items,
  loading,
  error,
}: StatusSummarySectionProps): JSX.Element => {
  return (
    <section className="mt-8">
      <SectionHeading title={StatusSummaryCopy.title} />

      <div className="max-w-[720px] rounded-[12px] bg-[color:var(--bg-card)] px-6 py-5">
        {loading ? (
          <div className="space-y-3">
            {SkeletonRegistry.lineIds.map((lineId) => (
              <div
                key={lineId}
                className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--border-subtle)]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[10px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <div>
            {items.map((item, index) => (
              <div
                key={item.displayText}
                className={index < items.length - 1 ? "mb-3 flex items-center gap-2" : "flex items-center gap-2"}
              >
                <span className="text-sm text-[color:var(--dot-green)]">●</span>
                <span className="text-sm text-[color:var(--text-primary)]">
                  {item.displayText}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
