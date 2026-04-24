import { ServiceHealth, ServiceHealthStatus } from "@/models/ServiceHealth";

export class ServiceHealthRegistry {
  private static instance: ServiceHealthRegistry | null = null;
  private readonly services: ServiceHealth[];

  private constructor() {
    this.services = [
      new ServiceHealth("ai-engine", "AI Processing Engine", ServiceHealthStatus.ONLINE, 99.98),
      new ServiceHealth("db", "Database Server", ServiceHealthStatus.ONLINE, 99.95),
      new ServiceHealth("storage", "Storage Service", ServiceHealthStatus.ONLINE, 99.99),
      new ServiceHealth("satellite", "Satellite API", ServiceHealthStatus.LIMITED, 95.5),
      new ServiceHealth("auth", "Authentication Service", ServiceHealthStatus.ONLINE, 99.97),
      new ServiceHealth("email", "Email Service", ServiceHealthStatus.ONLINE, 99.8),
    ];
  }

  public static getInstance(): ServiceHealthRegistry {
    if (ServiceHealthRegistry.instance === null) {
      ServiceHealthRegistry.instance = new ServiceHealthRegistry();
    }

    return ServiceHealthRegistry.instance;
  }

  public getAll(): ServiceHealth[] {
    return [...this.services];
  }

  public getLeftColumn(): ServiceHealth[] {
    return [this.services[0], this.services[2], this.services[4]];
  }

  public getRightColumn(): ServiceHealth[] {
    return [this.services[1], this.services[3], this.services[5]];
  }

  public getUnhealthyServices(): ServiceHealth[] {
    return this.services.filter((service) => !service.isHealthy);
  }

  public allHealthy(): boolean {
    return this.getUnhealthyServices().length === 0;
  }
}
