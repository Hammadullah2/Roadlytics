export class MapLayer {
  public readonly id: string;
  public readonly label: string;
  private readonly _visible: boolean;

  public constructor(id: string, label: string, visible: boolean = true) {
    this.id = id;
    this.label = label;
    this._visible = visible;
  }

  public get isVisible(): boolean {
    return this._visible;
  }

  public toggle(): MapLayer {
    return new MapLayer(this.id, this.label, !this._visible);
  }
}
