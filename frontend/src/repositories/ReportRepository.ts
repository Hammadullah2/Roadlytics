import { AssessmentReport, ReportType } from "@/models/AssessmentReport";

export class ReportRepository {
  private static instance: ReportRepository | null = null;
  private readonly reports: AssessmentReport[];

  private constructor() {
    this.reports = [
      new AssessmentReport(
        "45021",
        "#45021",
        ReportType.ASSESSMENT,
        "2026-01-11",
        "Region 1",
        "/reports/45021.pdf",
      ),
      new AssessmentReport(
        "45022",
        "#45022",
        ReportType.ASSESSMENT,
        "2026-01-12",
        "Region 2",
        "/reports/45022.pdf",
      ),
      new AssessmentReport(
        "45023",
        "#45023",
        ReportType.ASSESSMENT,
        "2026-01-13",
        "Region 3",
        "/reports/45023.pdf",
      ),
      new AssessmentReport(
        "45024",
        "#45024",
        ReportType.ASSESSMENT,
        "2026-01-14",
        "Region 4",
        "/reports/45024.pdf",
      ),
      new AssessmentReport(
        "45025",
        "#45025",
        ReportType.ASSESSMENT,
        "2026-01-15",
        "Region 5",
        "/reports/45025.pdf",
      ),
    ];
  }

  public static getInstance(): ReportRepository {
    if (ReportRepository.instance === null) {
      ReportRepository.instance = new ReportRepository();
    }

    return ReportRepository.instance;
  }

  public getAll(): AssessmentReport[] {
    return [...this.reports];
  }

  public getById(id: string): AssessmentReport | undefined {
    return this.reports.find((report) => report.id === id);
  }

  public getByType(type: ReportType): AssessmentReport[] {
    return this.reports.filter((report) => report.type === type);
  }

  public search(query: string): AssessmentReport[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return this.getAll();
    }

    return this.reports.filter((report) =>
      [report.title, report.region, report.generatedOn]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  public sortByDateDesc(): AssessmentReport[] {
    return [...this.reports].sort((left, right) =>
      right.generatedOn.localeCompare(left.generatedOn),
    );
  }

  public sortByDateAsc(): AssessmentReport[] {
    return [...this.reports].sort((left, right) =>
      left.generatedOn.localeCompare(right.generatedOn),
    );
  }

  public getTotalCount(): number {
    return this.reports.length;
  }
}
