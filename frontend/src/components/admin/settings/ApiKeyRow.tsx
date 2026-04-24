import { PasswordField } from "@/models/settings/PasswordField";

type ApiKeyRowProps = {
  field: PasswordField;
  isTouched: boolean;
  onChange: (id: string, value: string) => void;
  onToggleMask: () => void;
  onTouched: (id: string) => void;
};

class ApiKeyRowCopy {
  public static readonly updateLabel = "Update";
  public static readonly hideLabel = "Hide";
}

export const ApiKeyRow = ({
  field,
  isTouched,
  onChange,
  onToggleMask,
  onTouched,
}: ApiKeyRowProps): JSX.Element => {
  const validation = field.validate();

  return (
    <div>
      <label className="mb-1.5 block text-[0.8rem] text-[color:var(--text-secondary)]">
        {field.label}
      </label>
      <div className="flex gap-2.5">
        <input
          type={field.isMasked ? "password" : "text"}
          value={field.value}
          onChange={(event) => onChange(field.id, event.target.value)}
          onBlur={() => onTouched(field.id)}
          className="h-11 flex-1 rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-primary)] px-4 text-[0.875rem] text-[color:var(--text-primary)] outline-none transition-colors duration-150 focus:border-[color:var(--accent-green)]"
        />
        <button
          type="button"
          onClick={onToggleMask}
          className="h-11 whitespace-nowrap rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] px-4 text-[0.875rem] font-medium text-[color:var(--text-primary)] transition-colors duration-150 hover:bg-[color:var(--border-subtle)]"
        >
          {field.isMasked ? ApiKeyRowCopy.updateLabel : ApiKeyRowCopy.hideLabel}
        </button>
      </div>
      {isTouched && !validation.valid ? (
        <p className="mt-1.5 text-[0.75rem] text-[#f85149]">
          {validation.errorMessage}
        </p>
      ) : null}
    </div>
  );
};
