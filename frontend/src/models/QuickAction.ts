import type { LucideIcon } from "lucide-react";

export type QuickActionVariant = "primary" | "secondary";

export class QuickAction {
  public readonly id: string;
  public readonly label: string;
  public readonly icon: LucideIcon;
  public readonly variant: QuickActionVariant;
  public readonly route: string;

  public constructor(
    id: string,
    label: string,
    icon: LucideIcon,
    variant: QuickActionVariant,
    route: string,
  ) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.variant = variant;
    this.route = route;
  }

  public isPrimary(): boolean {
    return this.variant === "primary";
  }
}
