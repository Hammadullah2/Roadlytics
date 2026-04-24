import { TextField } from "@/models/settings/TextField";
import type { ValidationResult } from "@/models/settings/SettingField";

export class PasswordField extends TextField {
  private _masked: boolean = true;

  public constructor(id: string, label: string, defaultValue: string) {
    super(id, label, defaultValue, 8, 512, "password");
  }

  public get isMasked(): boolean {
    return this._masked;
  }

  public toggleMask(): void {
    this._masked = !this._masked;
  }

  public validate(): ValidationResult {
    if (this.value.length < 8) {
      return {
        valid: false,
        errorMessage: "API key must be at least 8 characters",
      };
    }
    return { valid: true };
  }
}
