export class StatusItem {
  public readonly label: string;
  public readonly count: number;

  public constructor(label: string, count: number) {
    this.label = label;
    this.count = count;
  }

  public get displayText(): string {
    return `${this.label}: ${this.count}`;
  }
}
