import { UploadMethod } from "@/models/UploadMethod";
import { UploadFormState } from "@/models/UploadFormState";

type UploadMethodSelectorProps = {
  formState: UploadFormState;
  onFormStateChange: (nextState: UploadFormState) => void;
};

class UploadMethodSelectorCopy {
  public static readonly label = "Choose upload method:";
}

class UploadMethodSelectorStyles {
  public static readonly labelClassName =
    "mb-2 block text-sm font-medium text-[color:var(--text-secondary)]";
  public static readonly listClassName = "flex flex-col gap-2.5";
  public static readonly optionBaseClassName =
    "flex w-full items-center gap-3 rounded-[10px] border bg-[color:var(--bg-primary)] px-4 py-3.5 text-left transition-colors duration-150";
}

export const UploadMethodSelector = ({
  formState,
  onFormStateChange,
}: UploadMethodSelectorProps): JSX.Element => {
  return (
    <section>
      <label className={UploadMethodSelectorStyles.labelClassName}>
        {UploadMethodSelectorCopy.label}
      </label>

      <div className={UploadMethodSelectorStyles.listClassName}>
        {UploadMethod.getAll().map((method) => {
          const selected = formState.selectedMethod.equals(method);
          const borderClassName = selected
            ? "border-[color:var(--accent-green)]"
            : "border-[color:var(--border-subtle)]";

          return (
            <button
              key={method.value}
              type="button"
              onClick={() => {
                const nextState = formState.clone();
                nextState.setMethod(method);
                onFormStateChange(nextState);
              }}
              className={`${UploadMethodSelectorStyles.optionBaseClassName} ${borderClassName}`}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 ${
                  selected
                    ? "border-[color:var(--accent-green)]"
                    : "border-[color:var(--border-subtle)]"
                }`}
              >
                {selected ? (
                  <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[color:var(--accent-green)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                ) : null}
              </span>

              <span className="text-[0.9rem] font-medium text-[color:var(--text-primary)]">
                {method.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
