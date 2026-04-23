type ProgressBarProps = {
  value: number;
};

export const ProgressBar = ({ value }: ProgressBarProps): JSX.Element => {
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-[color:var(--border-subtle)]">
      <div
        className="h-1.5 rounded-full bg-[color:var(--accent-green)] transition-[width] duration-400 ease-in-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
};
