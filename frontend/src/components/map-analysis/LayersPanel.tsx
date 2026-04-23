import { Check } from "lucide-react";
import { useRef } from "react";
import type { CSSProperties } from "react";

import { MapAnalysisController } from "@/controllers/MapAnalysisController";
import type { MapToolAction } from "@/models/MapTool";
import { MapToolRegistry } from "@/registries/MapToolRegistry";

type LayersPanelProps = {
  controller: MapAnalysisController;
  onControllerChange: () => void;
  drawRegionHint?: string;
  canCompleteDrawRegion?: boolean;
  hasDrawRegion?: boolean;
  onCompleteDrawRegion?: () => void;
  onClearDrawRegion?: () => void;
  style?: CSSProperties;
};

class LayersPanelCopy {
  public static readonly layersLabel = "Layers";
  public static readonly toolsLabel = "Tools";
  public static readonly drawHint =
    "Click points on the map to outline a region, then finish it and save it below the map.";
  public static readonly finishRegionLabel = "Finish Region";
  public static readonly clearLabel = "Clear";
  public static readonly viewingPrefix = "Viewing:";
  public static readonly geotiffAccept = ".tiff,.tif";
}

export const LayersPanel = ({
  controller,
  onControllerChange,
  drawRegionHint = LayersPanelCopy.drawHint,
  canCompleteDrawRegion = false,
  hasDrawRegion = false,
  onCompleteDrawRegion,
  onClearDrawRegion,
  style,
}: LayersPanelProps): JSX.Element => {
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const layers = controller.getLayers();
  const activeTool = controller.getActiveTool();

  const handleToolSelection = (action: MapToolAction): void => {
    controller.setActiveTool(activeTool === action ? null : action);
    onControllerChange();

    if (activeTool !== action && action === "upload-geotiff") {
      hiddenInputRef.current?.click();
    }
  };

  return (
    <div
      className="pointer-events-auto absolute left-5 top-5 z-[1100] min-w-[240px] max-w-[260px] rounded-[18px] border border-[color:var(--border-subtle)] bg-[rgba(22,27,34,0.94)] px-5 py-5 shadow-[0_28px_70px_-36px_rgba(0,0,0,0.88)] backdrop-blur-[10px]"
      style={style}
    >
      <h2 className="mb-3 text-[1rem] font-semibold text-[color:var(--text-primary)]">
        {LayersPanelCopy.layersLabel}
      </h2>

      <div className="space-y-3">
        {layers.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => {
              controller.toggleLayer(layer.id);
              onControllerChange();
            }}
            className="flex items-center gap-3 text-left"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-[4px] border transition-colors duration-150 ${
                layer.isVisible
                  ? "border-[color:var(--accent-green)] bg-[color:var(--accent-green)]"
                  : "border-[color:var(--border-subtle)] bg-transparent"
              }`}
            >
              {layer.isVisible ? <Check size={10} color="white" /> : null}
            </span>
            <span className="text-[0.98rem] text-[color:var(--text-primary)]">
              {layer.label}
            </span>
          </button>
        ))}
      </div>

      <div className="my-5 border-t border-[color:var(--border-subtle)]" />

      <h2 className="mb-3 text-[1rem] font-semibold text-[color:var(--text-primary)]">
        {LayersPanelCopy.toolsLabel}
      </h2>

      <div className="space-y-2">
        {MapToolRegistry.getAll().map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.action;

          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleToolSelection(tool.action)}
              className={`flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left transition-colors duration-150 ${
                active
                  ? "border border-[color:var(--accent-green)]/40 bg-[color:var(--bg-card-hover)]"
                  : "border border-transparent bg-[color:var(--bg-card-hover)] hover:border-[color:var(--border-subtle)]"
              }`}
            >
              <Icon
                size={16}
                color={active ? "var(--accent-green)" : "var(--text-secondary)"}
              />
              <span className="text-[0.95rem] text-[color:var(--text-primary)]">
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>

      {activeTool === "draw-region" ? (
        <div className="mt-3 space-y-3">
          <p className="text-[0.75rem] leading-6 text-[color:var(--text-secondary)]">
            {drawRegionHint}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCompleteDrawRegion}
              disabled={!canCompleteDrawRegion}
              className="flex-1 rounded-[8px] bg-[color:var(--accent-green)] px-3 py-2 text-[0.78rem] font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {LayersPanelCopy.finishRegionLabel}
            </button>
            <button
              type="button"
              onClick={onClearDrawRegion}
              disabled={!hasDrawRegion}
              className="rounded-[8px] border border-[color:var(--border-subtle)] px-3 py-2 text-[0.78rem] font-semibold text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {LayersPanelCopy.clearLabel}
            </button>
          </div>
        </div>
      ) : null}

      {activeTool === "select-date" ? (
        <div className="mt-3">
          <input
            type="date"
            value={controller.getSelectedDate()}
            onChange={(event) => {
              controller.setSelectedDate(event.target.value);
              onControllerChange();
            }}
            className="w-full rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none [color-scheme:dark]"
          />
          {controller.getSelectedDate() ? (
            <p className="mt-2 text-[0.75rem] text-[color:var(--text-secondary)]">
              {`${LayersPanelCopy.viewingPrefix} ${controller.getSelectedDate()}`}
            </p>
          ) : null}
        </div>
      ) : null}

      <input
        ref={hiddenInputRef}
        type="file"
        accept={LayersPanelCopy.geotiffAccept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          controller.queueGeoTiffUpload(file.name);
          onControllerChange();
        }}
      />
    </div>
  );
};
