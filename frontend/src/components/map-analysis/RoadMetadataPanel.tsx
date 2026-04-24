import { RoadMetadata } from "@/models/RoadMetadata";
import type { CSSProperties } from "react";

type RoadMetadataPanelProps = {
  metadata: RoadMetadata | null;
  emptyMessage?: string;
  style?: CSSProperties;
};

class RoadMetadataPanelCopy {
  public static readonly title = "Road Metadata";
}

export const RoadMetadataPanel = ({
  metadata,
  emptyMessage = "Select a road segment to inspect its metadata.",
  style,
}: RoadMetadataPanelProps): JSX.Element => {
  return (
    <div
      className="pointer-events-none absolute bottom-5 right-5 z-[1100] min-w-[220px] max-w-[250px] animate-[metadataFadeSlideIn_150ms_ease-out_forwards] rounded-[18px] border border-[color:var(--border-subtle)] bg-[rgba(22,27,34,0.94)] px-5 py-4 shadow-[0_28px_70px_-36px_rgba(0,0,0,0.88)] backdrop-blur-[10px]"
      style={style}
    >
      <h2 className="mb-3 text-[1rem] font-semibold text-[color:var(--text-primary)]">
        {RoadMetadataPanelCopy.title}
      </h2>

      {metadata ? (
        metadata.displayLines.map((line) => (
          <div key={line.label} className="mb-1.5 flex items-center justify-between gap-4 text-[0.82rem] last:mb-0">
            <span className="text-[color:var(--text-secondary)]">{line.label}</span>
            <span
              className="text-right font-medium text-[color:var(--text-primary)]"
              style={{
                color:
                  line.label === "Condition"
                    ? metadata.conditionColor
                    : "var(--text-primary)",
              }}
            >
              {line.value}
            </span>
          </div>
        ))
      ) : (
        <p className="text-[0.82rem] leading-6 text-[color:var(--text-secondary)]">
          {emptyMessage}
        </p>
      )}
    </div>
  );
};
