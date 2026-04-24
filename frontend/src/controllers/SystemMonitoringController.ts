import { adminClient } from "@/lib/adminClient";
import { CpuMetric } from "@/models/CpuMetric";
import { MemoryMetric } from "@/models/MemoryMetric";
import { NetworkMetric } from "@/models/NetworkMetric";
import { ServiceHealth, ServiceHealthStatus } from "@/models/ServiceHealth";
import { StorageMetric } from "@/models/StorageMetric";
import { LogLevel, SystemLogEntry } from "@/models/SystemLogEntry";
import type {
  BackendAdminLog,
  BackendAdminSystemSnapshot,
  BackendHealthResponse,
} from "@/types";

export class SystemMonitoringController {
  private _cpuMetric: CpuMetric = new CpuMetric(0);
  private _memoryMetric: MemoryMetric = new MemoryMetric(0);
  private _storageMetric: StorageMetric = new StorageMetric(0, 1);
  private _networkMetric: NetworkMetric = new NetworkMetric(0, 0, "Normal");
  private _services: ServiceHealth[] = [];
  private _logs: SystemLogEntry[] = [];
  private _isLoading: boolean = false;
  private _errorMessage: string | null = null;
  private onUpdate: (() => void) | null = null;

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public get isLoading(): boolean {
    return this._isLoading;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public async load(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const [systemSnapshot, health] = await Promise.all([
        adminClient.getSystem(),
        adminClient.getHealth(),
      ]);

      this._cpuMetric = new CpuMetric(systemSnapshot.cpu_percent);
      this._memoryMetric = new MemoryMetric(systemSnapshot.memory_used_gb);
      this._storageMetric = new StorageMetric(
        systemSnapshot.storage_used_gb,
        systemSnapshot.storage_total_tb,
      );
      this._networkMetric = new NetworkMetric(
        systemSnapshot.network_download_mbps,
        systemSnapshot.network_upload_mbps,
        toNetworkTrafficLevel(systemSnapshot.network_level),
      );
      this._services = mapServiceHealth(health);
      this._logs = systemSnapshot.logs.map(mapSystemLogEntry);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to load system data.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public getCpuMetric(): CpuMetric {
    return this._cpuMetric;
  }

  public getMemoryMetric(): MemoryMetric {
    return this._memoryMetric;
  }

  public getStorageMetric(): StorageMetric {
    return this._storageMetric;
  }

  public getNetworkMetric(): NetworkMetric {
    return this._networkMetric;
  }

  public startLiveUpdates(onUpdate: () => void): () => void {
    const intervalId = window.setInterval(() => {
      void this.load().finally(() => {
        onUpdate();
      });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }

  public getLeftColumnServices(): ServiceHealth[] {
    return this._services.slice(0, Math.ceil(this._services.length / 2));
  }

  public getRightColumnServices(): ServiceHealth[] {
    return this._services.slice(Math.ceil(this._services.length / 2));
  }

  public getAllServices(): ServiceHealth[] {
    return [...this._services];
  }

  public getLogs(): SystemLogEntry[] {
    return [...this._logs];
  }

  public refreshLogs(): SystemLogEntry[] {
    void this.load();
    return this.getLogs();
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }
}

const mapServiceHealth = (health: BackendHealthResponse): ServiceHealth[] => {
  return [
    new ServiceHealth(
      "database",
      "Database Server",
      toServiceHealthStatus(health.checks.database),
      toUptimePercent(health.checks.database),
    ),
    new ServiceHealth(
      "supabase",
      "Supabase API",
      toServiceHealthStatus(health.checks.supabase),
      toUptimePercent(health.checks.supabase),
    ),
    new ServiceHealth(
      "storage",
      "Storage System",
      toServiceHealthStatus(health.checks.storage),
      toUptimePercent(health.checks.storage),
    ),
    new ServiceHealth(
      "websocket_hub",
      "WebSocket Hub",
      toServiceHealthStatus(health.checks.websocket_hub),
      toUptimePercent(health.checks.websocket_hub),
    ),
    new ServiceHealth(
      "orchestrator",
      "Job Orchestrator",
      toServiceHealthStatus(health.checks.orchestrator),
      toUptimePercent(health.checks.orchestrator),
    ),
  ];
};

const toServiceHealthStatus = (status: string | undefined): ServiceHealthStatus => {
  switch (status) {
    case "connected":
    case "running":
      return ServiceHealthStatus.ONLINE;
    case "degraded":
      return ServiceHealthStatus.DEGRADED;
    case "disconnected":
    case "stopped":
      return ServiceHealthStatus.OFFLINE;
    default:
      return ServiceHealthStatus.LIMITED;
  }
};

const toUptimePercent = (status: string | undefined): number => {
  switch (status) {
    case "connected":
    case "running":
      return 99.9;
    case "degraded":
      return 92.5;
    case "disconnected":
    case "stopped":
      return 0;
    default:
      return 85;
  }
};

const toNetworkTrafficLevel = (
  value: BackendAdminSystemSnapshot["network_level"],
): "Normal" | "High" | "Critical" => {
  if (value === "High" || value === "Critical") {
    return value;
  }

  return "Normal";
};

const mapSystemLogEntry = (entry: BackendAdminLog): SystemLogEntry => {
  return new SystemLogEntry(
    entry.id,
    formatLogTimestamp(entry.created_at),
    mapLogLevel(entry.level),
    entry.message,
  );
};

const mapLogLevel = (level: string): LogLevel => {
  switch (level.toUpperCase()) {
    case "ERROR":
      return LogLevel.ERROR;
    case "WARNING":
      return LogLevel.WARNING;
    case "DEBUG":
      return LogLevel.DEBUG;
    case "INFO":
    default:
      return LogLevel.INFO;
  }
};

const formatLogTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};
