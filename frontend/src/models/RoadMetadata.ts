export enum RoadCondition {
  DAMAGED = "DAMAGED",
  GOOD = "GOOD",
  FAIR = "FAIR",
  UNKNOWN = "UNKNOWN",
}

export enum SurfaceType {
  UNPAVED = "Unpaved",
  PAVED = "Paved",
  GRAVEL = "Gravel",
  UNKNOWN = "Unknown",
}

type MetadataDisplayLine = {
  label: string;
  value: string;
};

class RoadConditionColors {
  public static readonly damaged = "#f85149";
  public static readonly good = "#2ea043";
  public static readonly fair = "#d29922";
  public static readonly unknown = "#8b949e";
}

export class RoadMetadata {
  public readonly roadId: string;
  public readonly condition: RoadCondition;
  public readonly surface: SurfaceType;
  public readonly lastUpdated: string;

  public constructor(
    roadId: string,
    condition: RoadCondition,
    surface: SurfaceType,
    lastUpdated: string,
  ) {
    this.roadId = roadId;
    this.condition = condition;
    this.surface = surface;
    this.lastUpdated = lastUpdated;
  }

  public get conditionColor(): string {
    switch (this.condition) {
      case RoadCondition.DAMAGED:
        return RoadConditionColors.damaged;
      case RoadCondition.GOOD:
        return RoadConditionColors.good;
      case RoadCondition.FAIR:
        return RoadConditionColors.fair;
      case RoadCondition.UNKNOWN:
        return RoadConditionColors.unknown;
      default:
        return RoadConditionColors.unknown;
    }
  }

  public get displayLines(): MetadataDisplayLine[] {
    return [
      { label: "Road ID", value: this.roadId },
      { label: "Condition", value: this.condition },
      { label: "Surface", value: this.surface },
      { label: "Last Updated", value: this.lastUpdated },
    ];
  }
}
