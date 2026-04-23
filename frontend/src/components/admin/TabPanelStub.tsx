import { AdminPanelController } from "@/controllers/AdminPanelController";
import { AdminTabRegistry } from "@/registries/AdminTabRegistry";

type TabPanelStubProps = {
  controller: AdminPanelController;
};

class TabPanelStubCopy {
  public static readonly suffix = " panel coming soon";
}

export const TabPanelStub = ({
  controller,
}: TabPanelStubProps): JSX.Element => {
  const activeView = controller.getActiveView();
  const tab =
    AdminTabRegistry.getAll().find((item) => item.panel === activeView) ??
    AdminTabRegistry.getDefault();
  const Icon = controller.getTabStubIcon(activeView);

  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-[color:var(--text-secondary)]">
      <Icon size={48} color="#30363d" />
      <p className="mt-4 text-sm">
        {`${tab.label}${TabPanelStubCopy.suffix}`}
      </p>
    </div>
  );
};
