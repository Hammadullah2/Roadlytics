import { AdminPanelController } from "@/controllers/AdminPanelController";

type RecentActivityCardProps = {
  controller: AdminPanelController;
};

class RecentActivityCardCopy {
  public static readonly title = "Recent Activity";
  public static readonly headers: string[] = ["User", "Action", "Project", "Time"];
}

export const RecentActivityCard = ({
  controller,
}: RecentActivityCardProps): JSX.Element => {
  const entries = controller.getRecentActivity(5);

  return (
    <section className="mb-6 mt-7 w-full">
      <h2 className="mb-3.5 text-[1.1rem] font-bold text-[color:var(--text-primary)]">
        {RecentActivityCardCopy.title}
      </h2>

      <div className="w-full overflow-hidden rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-0">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--border-subtle)] bg-[color:var(--bg-secondary)]">
              {RecentActivityCardCopy.headers.map((header) => (
                <th
                  key={header}
                  className="px-6 py-3.5 text-left text-[0.8rem] font-bold text-[color:var(--text-nav-label)]"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td
                  colSpan={RecentActivityCardCopy.headers.length}
                  className="px-6 py-6 text-center text-[0.875rem] text-[color:var(--text-secondary)]"
                >
                  No recent admin activity yet.
                </td>
              </tr>
            ) : (
              entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={`transition-colors duration-150 hover:bg-[color:var(--bg-card-hover)] ${
                    index < entries.length - 1 ? "border-b border-[color:var(--bg-card-hover)]" : ""
                  }`}
                >
                  <td className="px-6 py-3.5 text-[0.875rem] font-normal text-[color:var(--text-primary)]">
                    {entry.user}
                  </td>
                  <td className="px-6 py-3.5 text-[0.875rem] text-[color:var(--text-secondary)]">
                    {entry.action}
                  </td>
                  <td className="px-6 py-3.5 text-[0.875rem] text-[color:var(--text-secondary)]">
                    {entry.project}
                  </td>
                  <td className="px-6 py-3.5 text-[0.875rem] text-[color:var(--text-secondary)]">
                    {entry.timeAgo}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
