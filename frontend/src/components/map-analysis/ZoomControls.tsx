import { Minus, Plus } from "lucide-react";
import type { CSSProperties } from "react";

type ZoomControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  style?: CSSProperties;
};

export const ZoomControls = ({
  onZoomIn,
  onZoomOut,
  canZoomIn = true,
  canZoomOut = true,
  style,
}: ZoomControlsProps): JSX.Element => {
  return (
    <div
      className="absolute right-4 top-4 z-10 overflow-hidden rounded-[6px] border border-[color:var(--border-subtle)] bg-[rgba(22,27,34,0.92)] backdrop-blur-[8px]"
      style={style}
    >
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className="flex h-8 w-8 items-center justify-center border-b border-[color:var(--border-subtle)] text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className="flex h-8 w-8 items-center justify-center text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Minus size={16} />
      </button>
    </div>
  );
};
