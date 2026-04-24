import { LogLevel, SystemLogEntry } from "@/models/SystemLogEntry";

class LogMessageRegistry {
  public static readonly refreshMessages: string[] = [
    "Health check completed for compute nodes",
    "Background cleanup task executed",
    "Telemetry snapshot pushed to monitoring store",
    "System heartbeat validated successfully",
  ];
}

class SystemTime {
  public static nowAsHms(): string {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    const ss = now.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
}

export class SystemLogService {
  private static instance: SystemLogService | null = null;
  private readonly logs: SystemLogEntry[];
  private nextId: number = 6;

  private constructor() {
    this.logs = [
      new SystemLogEntry("l1", "14:32:15", LogLevel.INFO, "Satellite image processing completed successfully"),
      new SystemLogEntry("l2", "14:28:42", LogLevel.WARNING, "API rate limit approaching threshold (85%)"),
      new SystemLogEntry("l3", "14:15:30", LogLevel.INFO, "Database backup completed"),
      new SystemLogEntry("l4", "14:02:18", LogLevel.ERROR, "Connection timeout to external API (retried successfully)"),
      new SystemLogEntry("l5", "13:45:22", LogLevel.INFO, "New user registered: user@example.com"),
    ];
  }

  public static getInstance(): SystemLogService {
    if (SystemLogService.instance === null) {
      SystemLogService.instance = new SystemLogService();
    }

    return SystemLogService.instance;
  }

  public getAll(): SystemLogEntry[] {
    return [...this.logs];
  }

  public getRecent(limit: number): SystemLogEntry[] {
    return this.logs.slice(0, limit);
  }

  public getByLevel(level: LogLevel): SystemLogEntry[] {
    return this.logs.filter((entry) => entry.level === level);
  }

  public refresh(): SystemLogEntry[] {
    const messageIndex = Math.floor(
      Math.random() * LogMessageRegistry.refreshMessages.length,
    );
    const nextEntry = new SystemLogEntry(
      `l${this.nextId}`,
      SystemTime.nowAsHms(),
      LogLevel.INFO,
      LogMessageRegistry.refreshMessages[messageIndex],
    );
    this.nextId += 1;
    this.logs.unshift(nextEntry);
    return this.getAll();
  }
}
