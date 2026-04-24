import { AdminPanelController } from "@/controllers/AdminPanelController";

type AdminTopbarProps = {
  controller: AdminPanelController;
};

export const AdminTopbar = ({ controller }: AdminTopbarProps): JSX.Element => {
  const activeView = controller.getActiveView();

  return (
    <div style={{ borderBottom: "1px solid var(--border)", marginBottom: 22, display: "flex", gap: 4 }}>
      {controller.getTabs().map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => { controller.setActiveView(tab.panel); }}
          style={{
            background: "none",
            border: "none",
            padding: "10px 14px",
            fontSize: 14,
            fontWeight: 500,
            color: tab.isActive(activeView) ? "var(--accent)" : "var(--text-secondary)",
            borderBottom: tab.isActive(activeView) ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
