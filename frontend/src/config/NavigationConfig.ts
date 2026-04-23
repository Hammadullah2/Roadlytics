import {
  Activity,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Map,
  Settings,
} from "lucide-react";

import { NavigationItem } from "@/models/NavigationItem";

export class NavigationConfig {
  private static readonly items: NavigationItem[] = [
    new NavigationItem("dashboard", "Dashboard", LayoutDashboard, "/dashboard"),
    new NavigationItem("projects", "Projects", FolderKanban, "/projects"),
    new NavigationItem("map-analysis", "Map Analysis", Map, "/map-analysis"),
    new NavigationItem("processing", "Processing", Activity, "/processing"),
    new NavigationItem("reports", "Reports", FileText, "/reports"),
    new NavigationItem("admin", "Admin Panel", Settings, "/admin", true),
  ];

  public static getMainItems(): NavigationItem[] {
    return NavigationConfig.items.filter((item) => !item.isAdminOnly);
  }

  public static getAdminItems(): NavigationItem[] {
    return NavigationConfig.items.filter((item) => item.isAdminOnly);
  }
}
