export enum ReportType {
  ASSESSMENT = "Assessment",
  SEGMENTATION = "Segmentation",
  CONNECTIVITY = "Connectivity",
  CLASSIFICATION = "Classification",
}

export class AssessmentReport {
  public readonly id: string;
  public readonly reportNumber: string;
  public readonly type: ReportType;
  public readonly generatedOn: string;
  public readonly region: string;
  public readonly filePath: string;

  public constructor(
    id: string,
    reportNumber: string,
    type: ReportType,
    generatedOn: string,
    region: string,
    filePath: string,
  ) {
    this.id = id;
    this.reportNumber = reportNumber;
    this.type = type;
    this.generatedOn = generatedOn;
    this.region = region;
    this.filePath = filePath;
  }

  public get title(): string {
    return `${this.type} Report ${this.reportNumber}`;
  }

  public get subtitle(): string {
    return `Generated on ${this.generatedOn}`;
  }

  public get downloadFileName(): string {
    return `report-${this.id}.pdf`;
  }
}
