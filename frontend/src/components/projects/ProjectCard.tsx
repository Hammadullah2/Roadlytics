import { useNavigate } from "react-router-dom";

export type ProjectCardData = {
  id: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
  displayDate: string;
  route: string;
};

type ProjectCardProps = {
  card: ProjectCardData;
  index: number;
};

export const ProjectCard = ({
  card,
  index,
}: ProjectCardProps): JSX.Element => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(card.route)}
      className="flex h-[130px] flex-col justify-between rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5 text-left transition-[background-color,border-color] duration-150 hover:border-[#444c56] hover:bg-[color:var(--bg-card-hover)]"
      style={{
        animation: `fadeSlideUp 250ms ease-out forwards`,
        animationDelay: `${index * 60}ms`,
        opacity: 0,
      }}
    >
      <div>
        <h2 className="mb-1 text-base font-bold text-[color:var(--text-primary)]">
          {card.title}
        </h2>
        <p className="text-[0.8rem] text-[color:var(--text-secondary)]">
          {card.subtitle}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span
          className="text-[0.8rem] font-semibold"
          style={{ color: card.statusColor }}
        >
          {card.statusLabel}
        </span>
        <span className="text-[0.75rem] font-normal text-[color:var(--text-nav-label)]">
          {card.displayDate}
        </span>
      </div>
    </button>
  );
};
