import { RotateCw } from "lucide-react";

type SettingsActionBarProps = {
  canSave: boolean;
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
};

class SettingsActionBarCopy {
  public static readonly resetLabel = "Reset to Default";
  public static readonly saveLabel = "Save Changes";
  public static readonly savingLabel = "Saving...";
}

export const SettingsActionBar = ({
  canSave,
  isSaving,
  onReset,
  onSave,
}: SettingsActionBarProps): JSX.Element => {
  return (
    <div className="sticky bottom-0 mt-6 flex justify-end gap-3 bg-[color:var(--bg-primary)] py-4">
      <button
        type="button"
        onClick={onReset}
        className="rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] px-5 py-2.5 text-[0.875rem] font-medium text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--border-subtle)]"
      >
        {SettingsActionBarCopy.resetLabel}
      </button>

      <button
        type="button"
        onClick={onSave}
        disabled={!canSave || isSaving}
        className={`rounded-[8px] px-6 py-2.5 text-[0.875rem] font-semibold text-white transition-colors duration-150 ${
          !canSave || isSaving
            ? "cursor-not-allowed bg-[color:var(--accent-green)] opacity-60"
            : "bg-[color:var(--accent-green)] hover:bg-[color:var(--accent-green-hover)]"
        }`}
      >
        {isSaving ? (
          <span className="inline-flex items-center gap-2">
            <RotateCw size={14} className="animate-spin" />
            {SettingsActionBarCopy.savingLabel}
          </span>
        ) : (
          SettingsActionBarCopy.saveLabel
        )}
      </button>
    </div>
  );
};
