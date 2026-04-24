import { ChevronDown } from "lucide-react";

export type ProcessingRegionOption = {
  id: string;
  label: string;
};

type RegionSelectorCardProps = {
  regions: ProcessingRegionOption[];
  selectedRegionId: string;
  onChange: (regionId: string) => void;
  disabled?: boolean;
};

class RegionSelectorCardCopy {
  public static readonly title = "Select Region:";
}

export const RegionSelectorCard = ({
  regions,
  selectedRegionId,
  onChange,
  disabled = false,
}: RegionSelectorCardProps): JSX.Element => {
  return (
    <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <label className="mb-2.5 block text-sm font-semibold text-[color:var(--text-primary)]">
        {RegionSelectorCardCopy.title}
      </label>

      <div className="relative">
        <select
          value={selectedRegionId}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          disabled={disabled || regions.length === 0}
          className="h-11 w-full appearance-none rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 pr-10 text-[0.9rem] text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
        >
          {regions.length === 0 ? <option value="">No regions available</option> : null}
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.label}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[color:var(--text-secondary)]">
          <ChevronDown size={16} />
        </span>
      </div>
    </section>
  );
};
