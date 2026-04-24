import { AdminPanelController } from "@/controllers/AdminPanelController";

type SystemStatusCardProps = {
  controller: AdminPanelController;
};

class SystemStatusCardCopy {
  public static readonly title = "System Status";
}

export const SystemStatusCard = ({
  controller,
}: SystemStatusCardProps): JSX.Element => {
  return (
    <section className="mb-6 w-full">
      <h2 className="mb-3.5 text-[1.1rem] font-bold text-[color:var(--text-primary)]">
        {SystemStatusCardCopy.title}
      </h2>

      <div className="w-full rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-7 py-5">
        {controller.getSystemServices().length === 0 ? (
          <div className="py-2.5 text-[0.875rem] text-[color:var(--text-secondary)]">
            System status is not available yet.
          </div>
        ) : (
          controller.getSystemServices().map((service, index, services) => (
            <div
              key={service.id}
              className={`flex items-center justify-between py-2.5 ${
                index < services.length - 1 ? "border-b border-[color:var(--bg-card-hover)]" : ""
              }`}
            >
              <div className="flex items-center">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: service.dotColor }}
                />
                <span className="ml-3 text-[0.9rem] font-medium text-[color:var(--text-primary)]">
                  {service.name}
                </span>
              </div>

              <span
                className="text-[0.875rem] font-semibold"
                style={{ color: service.statusTextColor }}
              >
                {service.statusLabel}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
};
