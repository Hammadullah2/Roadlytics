type SectionHeadingProps = {
  title: string;
};

export const SectionHeading = ({ title }: SectionHeadingProps): JSX.Element => {
  return (
    <h2 className="mb-4 text-base font-semibold text-[color:var(--text-primary)]">
      {title}
    </h2>
  );
};
