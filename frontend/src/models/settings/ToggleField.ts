import {
  type SettingFieldType,
  SettingField,
  type ValidationResult,
} from "@/models/settings/SettingField";

export class ToggleField extends SettingField<boolean> {
  public constructor(id: string, label: string, defaultValue: boolean) {
    super(id, label, defaultValue, defaultValue);
  }

  public get fieldType(): SettingFieldType {
    return "toggle";
  }

  public toggle(): void {
    this._value = !this._value;
  }

  public validate(): ValidationResult {
    return { valid: true };
  }
}
