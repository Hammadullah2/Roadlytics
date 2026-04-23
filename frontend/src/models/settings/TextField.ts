import {
  type SettingFieldType,
  SettingField,
  type ValidationResult,
} from "@/models/settings/SettingField";

type TextInputType = "text" | "email" | "number" | "password";

export class TextField extends SettingField<string> {
  private readonly minLength: number;
  private readonly maxLength: number;
  public readonly inputType: TextInputType;
  public readonly placeholder: string;

  public constructor(
    id: string,
    label: string,
    defaultValue: string,
    minLength: number = 0,
    maxLength: number = 255,
    inputType: TextInputType = "text",
    placeholder: string = "",
  ) {
    super(id, label, defaultValue, defaultValue);
    this.minLength = minLength;
    this.maxLength = maxLength;
    this.inputType = inputType;
    this.placeholder = placeholder;
  }

  public get fieldType(): SettingFieldType {
    return this.inputType;
  }

  public validate(): ValidationResult {
    if (this.value.length < this.minLength) {
      return {
        valid: false,
        errorMessage: `Minimum ${this.minLength} characters required`,
      };
    }

    if (this.value.length > this.maxLength) {
      return {
        valid: false,
        errorMessage: `Maximum ${this.maxLength} characters allowed`,
      };
    }

    if (this.inputType === "email" && !this.value.includes("@")) {
      return { valid: false, errorMessage: "Invalid email address" };
    }

    if (this.inputType === "number" && Number.isNaN(Number(this.value))) {
      return { valid: false, errorMessage: "Must be a number" };
    }

    return { valid: true };
  }
}
