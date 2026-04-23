export class Region {
  public readonly id: string;
  public readonly name: string;
  public readonly displayName: string;

  public constructor(id: string, name: string, displayName: string) {
    this.id = id;
    this.name = name;
    this.displayName = displayName;
  }
}
