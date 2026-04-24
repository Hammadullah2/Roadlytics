import type { LucideIcon } from "lucide-react";

import {
  SettingField,
  type ValidationResult,
} from "@/models/settings/SettingField";

export type SettingsField = SettingField<string> | SettingField<boolean>;

export class SettingsSection {
  public readonly id: string;
  public readonly title: string;
  public readonly icon: LucideIcon | null;
  public readonly fields: SettingsField[];

  public constructor(
    id: string,
    title: string,
    icon: LucideIcon | null,
    fields: SettingsField[],
  ) {
    this.id = id;
    this.title = title;
    this.icon = icon;
    this.fields = fields;
  }

  public get isDirty(): boolean {
    return this.fields.some((field) => field.isDirty);
  }

  public reset(): void {
    this.fields.forEach((field) => field.reset());
  }

  public validate(): ValidationResult[] {
    return this.fields.map((field) => field.validate());
  }

  public isValid(): boolean {
    return this.validate().every((result) => result.valid);
  }
}
