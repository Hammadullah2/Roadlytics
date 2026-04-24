type RoleBadgeProps = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

export const RoleBadge = ({
  label,
  backgroundColor,
  textColor,
}: RoleBadgeProps): JSX.Element => {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-[0.2rem] text-[0.75rem] font-semibold"
      style={{ backgroundColor, color: textColor }}
    >
      {label}
    </span>
  );
};
