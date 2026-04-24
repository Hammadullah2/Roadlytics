import { UploadFormState } from "@/models/UploadFormState";

type DateRangeFieldsProps = {
  formState: UploadFormState;
  onFormStateChange: (nextState: UploadFormState) => void;
  onSelectRegionClick: () => void;
};

class DateRangeFieldsCopy {
  public static readonly downloadingLabel = "If downloading:";
  public static readonly regionPlaceholder = "Draw region on map";
  public static readonly dateRangeLabel = "Date Range:";
  public static readonly rangeSeparator = "-";
}

export const DateRangeFields = ({
  formState,
  onFormStateChange,
  onSelectRegionClick,
}: DateRangeFieldsProps): JSX.Element => {
  return (
    <section className="mt-5">
      <label className="mb-2 block text-sm font-medium text-[color:var(--text-primary)]">
        {DateRangeFieldsCopy.downloadingLabel}
      </label>

      <button
        type="button"
        onClick={onSelectRegionClick}
        className={`w-full rounded-[10px] border px-4 py-3.5 text-left text-[0.95rem] outline-none transition-colors duration-150 ${
          formState.hasRegionSelection()
            ? "border-[color:var(--accent-green)]/50 bg-[color:var(--bg-primary)] text-[color:var(--text-primary)] hover:border-[color:var(--accent-green)]"
            : "border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] text-[color:var(--text-secondary)] hover:border-[color:var(--accent-green)]/40"
        }`}
      >
        {formState.hasRegionSelection() ? formState.regionDescription : DateRangeFieldsCopy.regionPlaceholder}
      </button>

      {formState.hasRegionSelection() ? (
        <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
          Region selected. Click again to redraw it on the map.
        </p>
      ) : null}

      <label className="mb-2 mt-5 block text-sm font-medium text-[color:var(--text-primary)]">
        {DateRangeFieldsCopy.dateRangeLabel}
      </label>

      <div className="flex items-center justify-between gap-3">
        <input
          type="date"
          value={formState.startDate}
          onChange={(event) => {
            const nextState = formState.clone();
            nextState.setDateRange(event.target.value, formState.endDate);
            onFormStateChange(nextState);
          }}
          className="w-[47%] rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none [color-scheme:dark]"
        />

        <span className="text-sm text-[color:var(--text-secondary)]">
          {DateRangeFieldsCopy.rangeSeparator}
        </span>

        <input
          type="date"
          value={formState.endDate}
          onChange={(event) => {
            const nextState = formState.clone();
            nextState.setDateRange(formState.startDate, event.target.value);
            onFormStateChange(nextState);
          }}
          className="w-[47%] rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none [color-scheme:dark]"
        />
      </div>
    </section>
  );
};
