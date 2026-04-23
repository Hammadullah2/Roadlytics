import { MapLayer } from "@/models/MapLayer";

export class MapLayerRegistry {
  private _layers: MapLayer[];

  public constructor() {
    this._layers = [
      new MapLayer("satellite", "Satellite", true),
      new MapLayer("road-segmentation", "Road Segmentation", true),
      new MapLayer("connectivity", "Connectivity", false),
    ];
  }

  public getLayers(): MapLayer[] {
    return [...this._layers];
  }

  public toggleLayer(id: string): void {
    this._layers = this._layers.map((layer) =>
      layer.id === id ? layer.toggle() : layer,
    );
  }

  public isVisible(id: string): boolean {
    return this._layers.find((layer) => layer.id === id)?.isVisible ?? false;
  }
}
