import { ServiceStatus, SystemService } from "@/models/SystemService";

export class SystemStatusRegistry {
  private static instance: SystemStatusRegistry | null = null;
  private readonly services: SystemService[];

  private constructor() {
    this.services = [
      new SystemService("ai-engine", "AI Processing Engine", ServiceStatus.ONLINE, ""),
      new SystemService("db", "Database Server", ServiceStatus.ONLINE, ""),
      new SystemService("storage", "Storage System", ServiceStatus.ONLINE, "78% Used"),
      new SystemService("satellite", "Satellite API", ServiceStatus.LIMITED, "Rate Limit"),
    ];
  }

  public static getInstance(): SystemStatusRegistry {
    if (SystemStatusRegistry.instance === null) {
      SystemStatusRegistry.instance = new SystemStatusRegistry();
    }

    return SystemStatusRegistry.instance;
  }

  public getAll(): SystemService[] {
    return [...this.services];
  }

  public getById(id: string): SystemService | undefined {
    return this.services.find((service) => service.id === id);
  }

  public hasIssues(): boolean {
    return this.services.some((service) => service.status !== ServiceStatus.ONLINE);
  }
}
