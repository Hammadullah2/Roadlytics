import { CpuMetric } from "@/models/CpuMetric";
import { MemoryMetric } from "@/models/MemoryMetric";
import { NetworkMetric } from "@/models/NetworkMetric";
import { StorageMetric } from "@/models/StorageMetric";
import { SystemMetric } from "@/models/SystemMetric";

class MetricBounds {
  public static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}

class MetricFluctuation {
  public static nextSignedDelta(maxDelta: number): number {
    const random = Math.random() * maxDelta;
    return Math.random() >= 0.5 ? random : -random;
  }
}

export class SystemMetricsService {
  private static instance: SystemMetricsService | null = null;
  private readonly _cpu: CpuMetric;
  private readonly _memory: MemoryMetric;
  private readonly _storage: StorageMetric;
  private readonly _network: NetworkMetric;

  private constructor() {
    this._cpu = new CpuMetric(42);
    this._memory = new MemoryMetric(12.4);
    this._storage = new StorageMetric(780, 1);
    this._network = new NetworkMetric(125, 45, "Normal");
  }

  public static getInstance(): SystemMetricsService {
    if (SystemMetricsService.instance === null) {
      SystemMetricsService.instance = new SystemMetricsService();
    }

    return SystemMetricsService.instance;
  }

  public getCpu(): CpuMetric {
    return this._cpu;
  }

  public getMemory(): MemoryMetric {
    return this._memory;
  }

  public getStorage(): StorageMetric {
    return this._storage;
  }

  public getNetwork(): NetworkMetric {
    return this._network;
  }

  public getAllMetrics(): SystemMetric[] {
    return [this._cpu, this._memory, this._storage];
  }

  public simulateLiveUpdates(onUpdate: () => void): () => void {
    const intervalId = window.setInterval(() => {
      const nextCpu = MetricBounds.clamp(
        this._cpu.value + MetricFluctuation.nextSignedDelta(5),
        5,
        95,
      );
      this._cpu.updateValue(Math.round(nextCpu));

      const nextMemoryGb = MetricBounds.clamp(
        this._memory.usedGb + MetricFluctuation.nextSignedDelta(0.3),
        8,
        15.5,
      );
      this._memory.setUsedGb(Number(nextMemoryGb.toFixed(1)));

      onUpdate();
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }
}
