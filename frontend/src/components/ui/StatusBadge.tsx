/** This component renders consistent status badges for roles, approvals, and jobs. */
type StatusTone = "emerald" | "amber" | "red" | "slate" | "blue";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClasses: Record<StatusTone, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  red: "border-red-500/30 bg-red-500/15 text-red-300",
  slate: "border-slate-700 bg-slate-800 text-slate-200",
  blue: "border-sky-500/30 bg-sky-500/15 text-sky-300",
};

export const StatusBadge = ({ label, tone = "slate" }: StatusBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
};
