import { ReportsHeader } from "@/components/reports/ReportsHeader";
import { ReportsList } from "@/components/reports/ReportsList";
import { useReportRecords } from "@/hooks/useReportRecords";

class ReportsPageCopy {
  public static readonly title = "Reports";
}

const formatDate = (value: string): string => {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const ReportsPage = (): JSX.Element => {
  const { records, isLoading, error } = useReportRecords();
  const cards = records.map((record) => ({
    id: record.report.id,
    title: `${record.report.report_type} Report`,
    subtitle: `${record.project.name} • ${record.region.name} • ${formatDate(record.report.created_at)}`,
  }));

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <ReportsHeader title={ReportsPageCopy.title} />
      <ReportsList cards={cards} isLoading={isLoading} error={error} />
    </section>
  );
};
