import { MapLayer } from "@/models/MapLayer";

export class MapLayerRegistry {
  private _layers: MapLayer[];

  public constructor() {
    this._layers = [
      new MapLayer("satellite", "Satellite Image", true),
      new MapLayer("segmentation", "Road Segmentation", true),
      new MapLayer("good", "Good Roads", false),
      new MapLayer("damaged", "Damaged Roads", false),
      new MapLayer("unpaved", "Unpaved Roads", false),
      new MapLayer("combined", "Combined Condition", true),
      new MapLayer("connectivity", "Connectivity Map", false),
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
