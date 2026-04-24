/** This component renders a Tailwind-only progress bar without inline styles. */
type ProgressBarProps = {
  value: number;
};

const getWidthClassName = (value: number): string => {
  if (value >= 100) {
    return "w-full";
  }

  if (value >= 92) {
    return "w-11/12";
  }

  if (value >= 84) {
    return "w-10/12";
  }

  if (value >= 75) {
    return "w-9/12";
  }

  if (value >= 67) {
    return "w-8/12";
  }

  if (value >= 59) {
    return "w-7/12";
  }

  if (value >= 50) {
    return "w-6/12";
  }

  if (value >= 42) {
    return "w-5/12";
  }

  if (value >= 34) {
    return "w-4/12";
  }

  if (value >= 25) {
    return "w-3/12";
  }

  if (value >= 17) {
    return "w-2/12";
  }

  if (value >= 9) {
    return "w-1/12";
  }

  return value > 0 ? "w-[4%]" : "w-0";
};

export const ProgressBar = ({ value }: ProgressBarProps) => {
  return (
    <div className="space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full bg-emerald-500 transition-all ${getWidthClassName(value)}`} />
      </div>
      <p className="text-xs font-medium text-slate-400">{value}% complete</p>
    </div>
  );
};
