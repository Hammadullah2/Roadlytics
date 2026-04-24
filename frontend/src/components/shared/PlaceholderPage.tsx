type PlaceholderPageProps = {
  title: string;
};

export const PlaceholderPage = ({ title }: PlaceholderPageProps): JSX.Element => {
  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <h1 className="text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {title}
      </h1>
    </section>
  );
};
