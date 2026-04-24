import { ProjectCard, type ProjectCardData } from "@/components/projects/ProjectCard";
import { ProjectsEmptyState } from "@/components/projects/ProjectsEmptyState";

type ProjectsGridProps = {
  cards: ProjectCardData[];
  isLoading: boolean;
  error: string | null;
};

export const ProjectsGrid = ({ cards, isLoading, error }: ProjectsGridProps): JSX.Element => {
  if (isLoading) {
    return (
      <div className="rl-grid rl-grid-3" style={{ gap: 20 }}>
        {["skeleton-1", "skeleton-2", "skeleton-3"].map((item) => (
          <div
            key={item}
            style={{
              height: 280,
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: "14px 16px",
        borderRadius: "var(--radius-btn)",
        border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
        background: "color-mix(in srgb, var(--danger) 10%, white)",
        color: "var(--danger)",
        fontSize: 14,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div className="rl-grid rl-grid-3" style={{ gap: 20 }}>
      {cards.length === 0
        ? <ProjectsEmptyState />
        : cards.map((card, index) => (
            <ProjectCard key={card.id} card={card} index={index} />
          ))}
    </div>
  );
};
