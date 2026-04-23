import { ProjectCard, type ProjectCardData } from "@/components/projects/ProjectCard";
import { ProjectsEmptyState } from "@/components/projects/ProjectsEmptyState";

type ProjectsGridProps = {
  cards: ProjectCardData[];
  isLoading: boolean;
  error: string | null;
};

export const ProjectsGrid = ({
  cards,
  isLoading,
  error,
}: ProjectsGridProps): JSX.Element => {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {["skeleton-1", "skeleton-2", "skeleton-3"].map((item) => (
          <div
            key={item}
            className="h-[130px] animate-pulse rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)]"
          />
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {cards.length === 0
        ? <ProjectsEmptyState />
        : cards.map((card, index) => (
            <ProjectCard key={card.id} card={card} index={index} />
          ))}
    </section>
  );
};
