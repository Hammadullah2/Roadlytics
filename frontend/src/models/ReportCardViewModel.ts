import { AssessmentReport } from "@/models/AssessmentReport";

export class ReportCardViewModel {
  private readonly report: AssessmentReport;

  public constructor(report: AssessmentReport) {
    this.report = report;
  }

  public get id(): string {
    return this.report.id;
  }

  public get title(): string {
    return this.report.title;
  }

  public get subtitle(): string {
    return this.report.subtitle;
  }

  public get route(): string {
    return `/reports/${this.report.id}`;
  }

  public get filePath(): string {
    return this.report.filePath;
  }

  public get downloadName(): string {
    return this.report.downloadFileName;
  }
}
