import { MapLayer } from "@/models/MapLayer";
import type { MapToolAction } from "@/models/MapTool";
import {
  RoadCondition,
  RoadMetadata,
  SurfaceType,
} from "@/models/RoadMetadata";
import { MapLayerRegistry } from "@/registries/MapLayerRegistry";

export class MapAnalysisController {
  private readonly layerRegistry: MapLayerRegistry;
  private _activeTool: MapToolAction | null = null;
  private _selectedMetadata: RoadMetadata | null = null;
  private _selectedDate: string = "";
  private _toastMessage: string = "";

  public constructor() {
    this.layerRegistry = new MapLayerRegistry();
  }

  public getLayers(): MapLayer[] {
    return this.layerRegistry.getLayers();
  }

  public toggleLayer(id: string): void {
    this.layerRegistry.toggleLayer(id);
  }

  public setActiveTool(action: MapToolAction | null): void {
    this._activeTool = action;
  }

  public getActiveTool(): MapToolAction | null {
    return this._activeTool;
  }

  public setSelectedMetadata(meta: RoadMetadata | null): void {
    this._selectedMetadata = meta;
  }

  public getSelectedMetadata(): RoadMetadata | null {
    return this._selectedMetadata;
  }

  public simulateRoadClick(): RoadMetadata {
    return new RoadMetadata(
      "45021",
      RoadCondition.DAMAGED,
      SurfaceType.UNPAVED,
      "2026-01-08",
    );
  }

  public setSelectedDate(date: string): void {
    this._selectedDate = date;
  }

  public getSelectedDate(): string {
    return this._selectedDate;
  }

  public queueGeoTiffUpload(fileName: string): string {
    this._toastMessage = `GeoTIFF '${fileName}' queued for upload`;
    return this._toastMessage;
  }

  public getToastMessage(): string {
    return this._toastMessage;
  }

  public clearToastMessage(): void {
    this._toastMessage = "";
  }
}
