type ReportsHeaderProps = {
  title: string;
};

export const ReportsHeader = ({ title }: ReportsHeaderProps): JSX.Element => {
  return (
    <h1 className="mb-6 text-[1.75rem] font-bold text-[color:var(--text-primary)]">
      {title}
    </h1>
  );
};
