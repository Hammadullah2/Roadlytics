import { Region } from "@/models/Region";

export class RegionRegistry {
  private static instance: RegionRegistry | null = null;
  private readonly regions: Region[];

  private constructor() {
    this.regions = [
      new Region("r1", "Tharparkar_Region_04", "Tharparkar_Region_04"),
      new Region("r2", "Sindh_Region_01", "Sindh_Region_01"),
      new Region("r3", "Punjab_Region_02", "Punjab_Region_02"),
      new Region("r4", "Balochistan_Region_03", "Balochistan_Region_03"),
    ];
  }

  public static getInstance(): RegionRegistry {
    if (RegionRegistry.instance === null) {
      RegionRegistry.instance = new RegionRegistry();
    }

    return RegionRegistry.instance;
  }

  public getAll(): Region[] {
    return [...this.regions];
  }

  public getById(id: string): Region | undefined {
    return this.regions.find((region) => region.id === id);
  }

  public getDefault(): Region {
    return this.regions[2];
  }
}
