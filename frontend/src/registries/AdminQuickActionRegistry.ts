import {
  BarChart2,
  Database,
  Eye,
  FileDown,
  Settings,
  Users,
} from "lucide-react";

import { AdminQuickAction } from "@/models/AdminQuickAction";

export class AdminQuickActionRegistry {
  private static readonly actions: AdminQuickAction[] = [
    new AdminQuickAction("settings", "System Settings", Settings, "#2ea043", "#3fb950", "system-settings"),
    new AdminQuickAction("users", "Manage Users", Users, "#1f6feb", "#388bfd", "manage-users"),
    new AdminQuickAction("backup", "Database Backup", Database, "#8957e5", "#a371f7", "database-backup"),
    new AdminQuickAction("logs", "View Logs", Eye, "#da3633", "#f85149", "view-logs"),
    new AdminQuickAction("export", "Export Data", FileDown, "#21262d", "#30363d", "export-data"),
    new AdminQuickAction("metrics", "Performance Metrics", BarChart2, "#21262d", "#30363d", "performance-metrics"),
  ];

  public static getAll(): AdminQuickAction[] {
    return [...AdminQuickActionRegistry.actions];
  }

  public static getRow1(): AdminQuickAction[] {
    return AdminQuickActionRegistry.actions.slice(0, 3);
  }

  public static getRow2(): AdminQuickAction[] {
    return AdminQuickActionRegistry.actions.slice(3, 6);
  }
}
