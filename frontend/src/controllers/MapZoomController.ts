export class MapZoomController {
  private _zoom: number = 13;
  private readonly MIN_ZOOM: number = 3;
  private readonly MAX_ZOOM: number = 19;

  public get currentZoom(): number {
    return this._zoom;
  }

  public zoomIn(): number {
    this._zoom = Math.min(this._zoom + 1, this.MAX_ZOOM);
    return this._zoom;
  }

  public zoomOut(): number {
    this._zoom = Math.max(this._zoom - 1, this.MIN_ZOOM);
    return this._zoom;
  }

  public canZoomIn(): boolean {
    return this._zoom < this.MAX_ZOOM;
  }

  public canZoomOut(): boolean {
    return this._zoom > this.MIN_ZOOM;
  }
}
