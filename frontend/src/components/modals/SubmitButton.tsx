import { LoaderCircle } from "lucide-react";

type SubmitButtonProps = {
  disabled: boolean;
  isSubmitting: boolean;
  onClick: () => void;
};

class SubmitButtonCopy {
  public static readonly idleLabel = "Start Download / Upload";
  public static readonly loadingLabel = "Processing...";
}

export const SubmitButton = ({
  disabled,
  isSubmitting,
  onClick,
}: SubmitButtonProps): JSX.Element => {
  const disabledClassName = disabled
    ? "cursor-not-allowed opacity-60"
    : "cursor-pointer hover:bg-[color:var(--accent-green-hover)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[color:var(--accent-green)] text-base font-semibold text-white transition-colors duration-150 ${disabledClassName}`}
    >
      {isSubmitting ? (
        <>
          <LoaderCircle size={18} className="animate-spin" />
          <span>{SubmitButtonCopy.loadingLabel}</span>
        </>
      ) : (
        <span>{SubmitButtonCopy.idleLabel}</span>
      )}
    </button>
  );
};
