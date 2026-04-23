import { AdminPanelView, AdminTab } from "@/models/AdminTab";

export class AdminTabRegistry {
  private static readonly tabs: AdminTab[] = [
    new AdminTab("overview", "Overview", AdminPanelView.OVERVIEW),
    new AdminTab("users", "Users", AdminPanelView.USERS),
    new AdminTab("projects", "Projects", AdminPanelView.PROJECTS),
    new AdminTab("system", "System", AdminPanelView.SYSTEM),
    new AdminTab("settings", "Settings", AdminPanelView.SETTINGS),
  ];

  public static getAll(): AdminTab[] {
    return [...AdminTabRegistry.tabs];
  }

  public static getDefault(): AdminTab {
    return AdminTabRegistry.tabs[0];
  }
}
