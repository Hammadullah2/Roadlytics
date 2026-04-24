import { AssessmentReport, ReportType } from "@/models/AssessmentReport";
import { ReportCardViewModel } from "@/models/ReportCardViewModel";
import { ReportRepository } from "@/repositories/ReportRepository";

type SortOrder = "asc" | "desc";
type NavigateHandler = (path: string) => void;

export class ReportsPageController {
  private readonly repository: ReportRepository;
  private _searchQuery: string = "";
  private _sortOrder: SortOrder = "desc";
  private _typeFilter: ReportType | null = null;
  private navigateHandler: NavigateHandler = () => undefined;

  public constructor() {
    this.repository = ReportRepository.getInstance();
  }

  public setSearchQuery(query: string): void {
    this._searchQuery = query;
  }

  public setSortOrder(order: SortOrder): void {
    this._sortOrder = order;
  }

  public setTypeFilter(type: ReportType | null): void {
    this._typeFilter = type;
  }

  public setNavigateHandler(handler: NavigateHandler): void {
    this.navigateHandler = handler;
  }

  public getFilteredReports(): AssessmentReport[] {
    let reports = this.repository.search(this._searchQuery);

    if (this._typeFilter !== null) {
      reports = reports.filter((report) => report.type === this._typeFilter);
    }

    reports = [...reports].sort((left, right) =>
      this._sortOrder === "desc"
        ? right.generatedOn.localeCompare(left.generatedOn)
        : left.generatedOn.localeCompare(right.generatedOn),
    );

    return reports;
  }

  public getViewModels(): ReportCardViewModel[] {
    return this.getFilteredReports().map(
      (report) => new ReportCardViewModel(report),
    );
  }

  public getTotalCount(): number {
    return this.repository.getTotalCount();
  }

  public getFilteredCount(): number {
    return this.getFilteredReports().length;
  }

  public handleViewReport(reportId: string): void {
    this.navigateHandler(`/reports/${reportId}`);
  }

  public handleDownloadReport(report: AssessmentReport): void {
    console.log(`Downloading: ${report.downloadFileName}`);
  }
}
