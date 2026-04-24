import { TextField } from "@/models/settings/TextField";

type TextSettingRowProps = {
  field: TextField;
  isTouched: boolean;
  onChange: (id: string, value: string) => void;
  onTouched: (id: string) => void;
};

export const TextSettingRow = ({
  field,
  isTouched,
  onChange,
  onTouched,
}: TextSettingRowProps): JSX.Element => {
  const validation = field.validate();

  return (
    <div>
      <label className="mb-1.5 block text-[0.8rem] text-[color:var(--text-secondary)]">
        {field.label}
      </label>
      <input
        type={field.fieldType}
        value={field.value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(field.id, event.target.value)}
        onBlur={() => onTouched(field.id)}
        className="h-11 w-full rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-[0.875rem] text-[color:var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[color:var(--text-nav-label)] focus:border-[color:var(--accent-green)]"
      />
      {isTouched && !validation.valid ? (
        <p className="mt-1.5 text-[0.75rem] text-[#f85149]">
          {validation.errorMessage}
        </p>
      ) : null}
    </div>
  );
};
