export enum AdminPanelView {
  OVERVIEW = "overview",
  USERS = "users",
  PROJECTS = "projects",
  SYSTEM = "system",
  SETTINGS = "settings",
}

export class AdminTab {
  public readonly id: string;
  public readonly label: string;
  public readonly panel: AdminPanelView;

  public constructor(id: string, label: string, panel: AdminPanelView) {
    this.id = id;
    this.label = label;
    this.panel = panel;
  }

  public isActive(current: AdminPanelView): boolean {
    return this.panel === current;
  }
}
