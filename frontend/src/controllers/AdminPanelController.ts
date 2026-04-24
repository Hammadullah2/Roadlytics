import {
  type LucideIcon,
  Activity,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

import { adminClient } from "@/lib/adminClient";
import { ActivityEntry } from "@/models/ActivityEntry";
import { type AdminActionType, AdminQuickAction } from "@/models/AdminQuickAction";
import { AdminPanelView, AdminTab } from "@/models/AdminTab";
import { StatCard } from "@/models/StatCard";
import { ServiceStatus, SystemService } from "@/models/SystemService";
import { AdminQuickActionRegistry } from "@/registries/AdminQuickActionRegistry";
import { AdminTabRegistry } from "@/registries/AdminTabRegistry";
import type { BackendHealthResponse } from "@/types";

type AdminNavigateHandler = (path: string) => void;

export class AdminPanelController {
  private _activeView: AdminPanelView = AdminPanelView.OVERVIEW;
  private navigateHandler: AdminNavigateHandler = () => undefined;
  private _toastMessage: string = "";
  private onUpdate: (() => void) | null = null;
  private _statCards: StatCard[] = [];
  private _systemServices: SystemService[] = [];
  private _recentActivity: ActivityEntry[] = [];
  private _isLoading: boolean = false;
  private _errorMessage: string | null = null;

  public getTabs(): AdminTab[] {
    return AdminTabRegistry.getAll();
  }

  public getActiveView(): AdminPanelView {
    return this._activeView;
  }

  public setActiveView(view: AdminPanelView): void {
    this._activeView = view;
    this.notifyUpdate();
  }

  public setNavigateHandler(handler: AdminNavigateHandler): void {
    this.navigateHandler = handler;
  }

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public get isLoading(): boolean {
    return this._isLoading;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public async loadOverview(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const [overview, health] = await Promise.all([
        adminClient.getOverview(),
        adminClient.getHealth(),
      ]);

      this._statCards = [
        new StatCard(
          "users",
          "Total Users",
          formatCount(overview.total_users),
          `${overview.recent_activity.length} recent activities`,
          "neutral",
          "#1f6feb",
          Users,
        ),
        new StatCard(
          "projects",
          "Total Projects",
          formatCount(overview.total_projects),
          "Across all users",
          "neutral",
          "#388bfd",
          FolderKanban,
        ),
        new StatCard(
          "jobs",
          "Active Jobs",
          formatCount(overview.active_jobs),
          overview.active_jobs > 0 ? "Processing now" : "No active jobs",
          overview.active_jobs > 0 ? "up" : "neutral",
          "#8957e5",
          Activity,
        ),
        new StatCard(
          "reports",
          "Reports Generated",
          formatCount(overview.reports_count),
          "Stored in database",
          "neutral",
          "#da3633",
          FileText,
        ),
      ];

      this._recentActivity = overview.recent_activity.map((entry) => {
        return new ActivityEntry(
          entry.id,
          entry.user,
          entry.action,
          entry.project,
          formatRelativeTime(entry.created_at),
        );
      });

      this._systemServices = mapOverviewServices(health);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to load admin overview.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public getStatCards(): StatCard[] {
    return this._statCards;
  }

  public getSystemServices(): SystemService[] {
    return this._systemServices;
  }

  public getRecentActivity(limit: number = 5): ActivityEntry[] {
    return this._recentActivity.slice(0, limit);
  }

  public getQuickActions(): AdminQuickAction[] {
    return AdminQuickActionRegistry.getAll();
  }

  public handleQuickAction(action: AdminActionType): void {
    switch (action) {
      case "system-settings":
        this.navigateToView(AdminPanelView.SETTINGS);
        return;
      case "manage-users":
        this.navigateToView(AdminPanelView.USERS);
        return;
      case "database-backup":
        this._toastMessage = "Use the Supabase database dashboard for managed backups.";
        this.notifyUpdate();
        return;
      case "view-logs":
        this.navigateToView(AdminPanelView.SYSTEM);
        return;
      case "export-data":
        this.exportOverviewSnapshot();
        return;
      case "performance-metrics":
        this.navigateToView(AdminPanelView.SYSTEM);
        return;
      default:
        return;
    }
  }

  public getToastMessage(): string {
    return this._toastMessage;
  }

  public clearToastMessage(): void {
    this._toastMessage = "";
    this.notifyUpdate();
  }

  public getTabStubIcon(view: AdminPanelView): LucideIcon {
    switch (view) {
      case AdminPanelView.USERS:
        return Users;
      case AdminPanelView.PROJECTS:
        return FolderKanban;
      case AdminPanelView.SYSTEM:
        return Activity;
      case AdminPanelView.SETTINGS:
        return Settings;
      case AdminPanelView.OVERVIEW:
      default:
        return LayoutDashboard;
    }
  }

  private navigateToView(view: AdminPanelView): void {
    this._activeView = view;
    this.navigateHandler(`/admin?tab=${view}`);
    this.notifyUpdate();
  }

  private exportOverviewSnapshot(): void {
    const snapshot = {
      stat_cards: this._statCards.map((card) => ({
        id: card.id,
        label: card.label,
        value: card.value,
        trend: card.trend,
      })),
      system_services: this._systemServices.map((service) => ({
        id: service.id,
        name: service.name,
        status: service.statusLabel,
      })),
      recent_activity: this._recentActivity.map((entry) => ({
        id: entry.id,
        user: entry.user,
        action: entry.action,
        project: entry.project,
        time_ago: entry.timeAgo,
      })),
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "admin-overview.json";
    link.click();
    window.URL.revokeObjectURL(url);
    this._toastMessage = "Overview data exported";
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }
}

const formatCount = (value: number): string => {
  return value.toLocaleString();
};

const formatRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const mapOverviewServices = (health: BackendHealthResponse): SystemService[] => {
  return [
    new SystemService(
      "orchestrator",
      "AI Processing Engine",
      toOverviewServiceStatus(health.checks.orchestrator),
      toOverviewServiceDetail(health.checks.orchestrator),
    ),
    new SystemService(
      "database",
      "Database Server",
      toOverviewServiceStatus(health.checks.database),
      toOverviewServiceDetail(health.checks.database),
    ),
    new SystemService(
      "storage",
      "Storage System",
      toOverviewServiceStatus(health.checks.storage),
      toOverviewServiceDetail(health.checks.storage),
    ),
    new SystemService(
      "supabase",
      "Supabase API",
      toOverviewServiceStatus(health.checks.supabase),
      toOverviewServiceDetail(health.checks.supabase),
    ),
  ];
};

const toOverviewServiceStatus = (status: string | undefined): ServiceStatus => {
  switch (status) {
    case "connected":
    case "running":
      return ServiceStatus.ONLINE;
    case "degraded":
      return ServiceStatus.DEGRADED;
    case "stopped":
    case "disconnected":
      return ServiceStatus.OFFLINE;
    default:
      return ServiceStatus.LIMITED;
  }
};

const toOverviewServiceDetail = (status: string | undefined): string => {
  switch (status) {
    case "connected":
      return "";
    case "running":
      return "";
    case "degraded":
      return "Degraded";
    case "stopped":
      return "Stopped";
    case "disconnected":
      return "Disconnected";
    default:
      return status ?? "";
  }
};
