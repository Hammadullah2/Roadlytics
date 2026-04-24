import { useNavigate } from "react-router-dom";

export type ReportCardData = {
  id: string;
  title: string;
  subtitle: string;
};

type ReportCardProps = {
  card: ReportCardData;
  index: number;
};

class ReportCardCopy {
  public static readonly buttonLabel = "View Report";
}

export const ReportCard = ({
  card,
  index,
}: ReportCardProps): JSX.Element => {
  const navigate = useNavigate();

  return (
    <div
      className="flex w-full items-center justify-between rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-7 py-5 transition-[background-color,border-color] duration-150 hover:border-[#444c56] hover:bg-[color:var(--bg-card-hover)]"
      style={{
        animation: "reportFadeSlideUp 220ms ease-out forwards",
        animationDelay: `${index * 50}ms`,
        opacity: 0,
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-[color:var(--text-primary)]">
          {card.title}
        </h2>
        <p className="text-[0.8rem] font-normal text-[color:var(--text-secondary)]">
          {card.subtitle}
        </p>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/reports/${card.id}`)}
        className="rounded-[8px] bg-[color:var(--accent-green)] px-5 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[color:var(--accent-green-hover)]"
      >
        {ReportCardCopy.buttonLabel}
      </button>
    </div>
  );
};
