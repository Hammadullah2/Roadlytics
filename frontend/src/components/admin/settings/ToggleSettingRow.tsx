import { Check } from "lucide-react";

import { ToggleField } from "@/models/settings/ToggleField";

type ToggleSettingRowProps = {
  field: ToggleField;
  onToggle: (id: string) => void;
};

export const ToggleSettingRow = ({
  field,
  onToggle,
}: ToggleSettingRowProps): JSX.Element => {
  return (
    <button
      type="button"
      onClick={() => onToggle(field.id)}
      className="flex w-full items-center justify-between rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 py-3.5 text-left"
    >
      <span className="text-[0.875rem] font-medium text-[color:var(--text-primary)]">
        {field.label}
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-[4px] border-[1.5px] transition-colors duration-150 ${
          field.value
            ? "border-[color:var(--accent-green)] bg-[color:var(--accent-green)]"
            : "border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)]"
        }`}
      >
        {field.value ? <Check size={12} color="white" /> : null}
      </span>
    </button>
  );
};
