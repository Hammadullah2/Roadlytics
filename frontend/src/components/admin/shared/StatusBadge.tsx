type StatusBadgeProps = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

export const StatusBadge = ({
  label,
  backgroundColor,
  textColor,
}: StatusBadgeProps): JSX.Element => {
  return (
    <span
      className="inline-block rounded-full px-3 py-[0.2rem] text-[0.75rem] font-semibold"
      style={{ backgroundColor, color: textColor }}
    >
      {label}
    </span>
  );
};
