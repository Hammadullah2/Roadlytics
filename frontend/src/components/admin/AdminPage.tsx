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
      case AdminPanelView.USERS: return AdminPanelView.USERS;
      case AdminPanelView.PROJECTS: return AdminPanelView.PROJECTS;
      case AdminPanelView.SYSTEM: return AdminPanelView.SYSTEM;
      case AdminPanelView.SETTINGS: return AdminPanelView.SETTINGS;
      case AdminPanelView.OVERVIEW: return AdminPanelView.OVERVIEW;
      default: return null;
    }
  }
}

export const AdminPage = (): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const [controller] = useState(() => new AdminPanelController());
  const [userController] = useState(() => new UserManagementController());
  const [projectController] = useState(() => new ProjectManagementController());
  const [systemController] = useState(() => new SystemMonitoringController());
  const [settingsController] = useState(() => new SystemSettingsController());
  const [, forceRender] = useReducer((v: number) => v + 1, 0);
  const activeView = controller.getActiveView();

  controller.setNavigateHandler(navigate);
  projectController.setNavigateHandler(navigate);

  useEffect(() => { controller.setOnUpdate(() => { forceRender(); }); }, [controller]);
  useEffect(() => { userController.setOnUpdate(() => { forceRender(); }); }, [userController]);
  useEffect(() => { projectController.setOnUpdate(() => { forceRender(); }); }, [projectController]);
  useEffect(() => { systemController.setOnUpdate(() => { forceRender(); }); }, [systemController]);
  useEffect(() => { settingsController.setOnUpdate(() => { forceRender(); }); }, [settingsController]);

  useEffect(() => {
    const view = AdminPageQueryParser.parseView(location.search);
    controller.setActiveView(view ?? AdminPanelView.OVERVIEW);
  }, [controller, location.search]);

  useEffect(() => {
    switch (activeView) {
      case AdminPanelView.OVERVIEW: void controller.loadOverview(); break;
      case AdminPanelView.USERS: void userController.load(); break;
      case AdminPanelView.PROJECTS: void projectController.load(); break;
      case AdminPanelView.SYSTEM: void systemController.load(); break;
      case AdminPanelView.SETTINGS: void settingsController.load(); break;
    }
  }, [controller, userController, projectController, systemController, settingsController, activeView]);

  useEffect(() => {
    if (!controller.getToastMessage()) return;
    const id = window.setTimeout(() => { controller.clearToastMessage(); }, 2200);
    return () => { window.clearTimeout(id); };
  }, [controller, controller.getToastMessage()]);

  return (
    <div>
      {/* Page header */}
      <div className="row space-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <div className="muted" style={{ marginTop: 4 }}>Manage users, monitor services, and govern models.</div>
        </div>
      </div>

      {controller.getToastMessage() && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: "var(--radius-btn)",
          background: "color-mix(in srgb, var(--success) 10%, white)",
          color: "var(--success)",
          fontSize: 13,
          border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
        }}>
          {controller.getToastMessage()}
        </div>
      )}

      <AdminShell topbar={<AdminTopbar controller={controller} />}>
        {activeView === AdminPanelView.OVERVIEW && <OverviewPanel controller={controller} />}
        {activeView === AdminPanelView.USERS && <UserManagementPanel controller={userController} />}
        {activeView === AdminPanelView.PROJECTS && <ProjectManagementPanel controller={projectController} />}
        {activeView === AdminPanelView.SYSTEM && <SystemPanel controller={systemController} />}
        {activeView === AdminPanelView.SETTINGS && <SettingsPanel controller={settingsController} />}
        {![AdminPanelView.OVERVIEW, AdminPanelView.USERS, AdminPanelView.PROJECTS, AdminPanelView.SYSTEM, AdminPanelView.SETTINGS].includes(activeView) && (
          <TabPanelStub controller={controller} />
        )}
      </AdminShell>
    </div>
  );
};
