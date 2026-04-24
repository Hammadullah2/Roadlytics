import type { LucideIcon } from "lucide-react";

export class NavigationItem {
  public readonly id: string;
  public readonly label: string;
  public readonly icon: LucideIcon;
  public readonly route: string;
  public readonly isAdminOnly: boolean;

  public constructor(
    id: string,
    label: string,
    icon: LucideIcon,
    route: string,
    isAdminOnly: boolean = false,
  ) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.route = route;
    this.isAdminOnly = isAdminOnly;
  }

  public isActive(currentRoute: string): boolean {
    if (this.route === "/dashboard") {
      return currentRoute === this.route;
    }

    return currentRoute === this.route || currentRoute.startsWith(`${this.route}/`);
  }
}
