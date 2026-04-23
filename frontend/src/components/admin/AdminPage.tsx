import { useEffect, useReducer, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AdminPanelController } from "@/controllers/AdminPanelController";
import { AdminPanelView } from "@/models/AdminTab";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { OverviewPanel } from "@/components/admin/OverviewPanel";
import { ProjectManagementPanel } from "@/components/admin/panels/ProjectManagementPanel";
import { SettingsPanel } from "@/components/admin/panels/SettingsPanel";
import { SystemPanel } from "@/components/admin/panels/SystemPanel";
import { UserManagementPanel } from "@/components/admin/panels/UserManagementPanel";
import { TabPanelStub } from "@/components/admin/TabPanelStub";
import { ProjectManagementController } from "@/controllers/ProjectManagementController";
import { SystemSettingsController } from "@/controllers/SystemSettingsController";
import { SystemMonitoringController } from "@/controllers/SystemMonitoringController";
import { UserManagementController } from "@/controllers/UserManagementController";

class AdminPageQueryParser {
  public static parseView(search: string): AdminPanelView | null {
    const params = new URLSearchParams(search);
    const tab = params.get("tab");

    switch (tab) {
      case AdminPanelView.USERS:
        return AdminPanelView.USERS;
      case AdminPanelView.PROJECTS:
        return AdminPanelView.PROJECTS;
      case AdminPanelView.SYSTEM:
        return AdminPanelView.SYSTEM;
      case AdminPanelView.SETTINGS:
        return AdminPanelView.SETTINGS;
      case AdminPanelView.OVERVIEW:
        return AdminPanelView.OVERVIEW;
      default:
        return null;
    }
  }
}

export const AdminPage = (): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const [controller] = useState<AdminPanelController>(
    () => new AdminPanelController(),
  );
  const [userManagementController] = useState<UserManagementController>(
    () => new UserManagementController(),
  );
  const [projectManagementController] = useState<ProjectManagementController>(
    () => new ProjectManagementController(),
  );
  const [systemMonitoringController] = useState<SystemMonitoringController>(
    () => new SystemMonitoringController(),
  );
  const [systemSettingsController] = useState<SystemSettingsController>(
    () => new SystemSettingsController(),
  );
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  const activeView = controller.getActiveView();

  controller.setNavigateHandler(navigate);
  projectManagementController.setNavigateHandler(navigate);

  useEffect(() => {
    controller.setOnUpdate(() => {
      forceRender();
    });
  }, [controller]);

  useEffect(() => {
    userManagementController.setOnUpdate(() => {
      forceRender();
    });
  }, [userManagementController]);

  useEffect(() => {
    projectManagementController.setOnUpdate(() => {
      forceRender();
    });
  }, [projectManagementController]);

  useEffect(() => {
    systemMonitoringController.setOnUpdate(() => {
      forceRender();
    });
  }, [systemMonitoringController]);

  useEffect(() => {
    systemSettingsController.setOnUpdate(() => {
      forceRender();
    });
  }, [systemSettingsController]);

  useEffect(() => {
    const view = AdminPageQueryParser.parseView(location.search);
    controller.setActiveView(view ?? AdminPanelView.OVERVIEW);
  }, [controller, location.search]);

  useEffect(() => {
    switch (activeView) {
      case AdminPanelView.OVERVIEW:
        void controller.loadOverview();
        break;
      case AdminPanelView.USERS:
        void userManagementController.load();
        break;
      case AdminPanelView.PROJECTS:
        void projectManagementController.load();
        break;
      case AdminPanelView.SYSTEM:
        void systemMonitoringController.load();
        break;
      case AdminPanelView.SETTINGS:
        void systemSettingsController.load();
        break;
      default:
        break;
    }
  }, [
    controller,
    userManagementController,
    projectManagementController,
    systemMonitoringController,
    systemSettingsController,
    activeView,
  ]);

  useEffect(() => {
    if (!controller.getToastMessage()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      controller.clearToastMessage();
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [controller, controller.getToastMessage()]);

  return (
    <AdminShell topbar={<AdminTopbar controller={controller} />}>
      {controller.getToastMessage() ? (
        <div className="mb-6 rounded-[10px] border border-[color:var(--accent-green)]/30 bg-[color:var(--accent-green)]/10 px-4 py-3 text-sm text-[color:var(--text-primary)]">
          {controller.getToastMessage()}
        </div>
      ) : null}

      {controller.getActiveView() === AdminPanelView.OVERVIEW ? <OverviewPanel controller={controller} /> : null}
      {controller.getActiveView() === AdminPanelView.USERS ? <UserManagementPanel controller={userManagementController} /> : null}
      {controller.getActiveView() === AdminPanelView.PROJECTS ? <ProjectManagementPanel controller={projectManagementController} /> : null}
      {controller.getActiveView() === AdminPanelView.SYSTEM ? <SystemPanel controller={systemMonitoringController} /> : null}
      {controller.getActiveView() === AdminPanelView.SETTINGS ? <SettingsPanel controller={systemSettingsController} /> : null}
      {controller.getActiveView() !== AdminPanelView.OVERVIEW &&
      controller.getActiveView() !== AdminPanelView.USERS &&
      controller.getActiveView() !== AdminPanelView.PROJECTS &&
      controller.getActiveView() !== AdminPanelView.SYSTEM &&
      controller.getActiveView() !== AdminPanelView.SETTINGS ? (
        <TabPanelStub controller={controller} />
      ) : null}
    </AdminShell>
  );
};
