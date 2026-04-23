export interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
}

export type SettingFieldType =
  | "text"
  | "email"
  | "number"
  | "password"
  | "toggle";

export abstract class SettingField<T> {
  public readonly id: string;
  public readonly label: string;
  protected _value: T;
  protected _defaultValue: T;

  public constructor(id: string, label: string, value: T, defaultValue: T) {
    this.id = id;
    this.label = label;
    this._value = value;
    this._defaultValue = defaultValue;
  }

  public get value(): T {
    return this._value;
  }

  public get defaultValue(): T {
    return this._defaultValue;
  }

  public get isDirty(): boolean {
    return this._value !== this._defaultValue;
  }

  public setValue(value: T): void {
    this._value = value;
  }

  public syncValue(value: T): void {
    this._value = value;
    this._defaultValue = value;
  }

  public reset(): void {
    this._value = this._defaultValue;
  }

  public abstract validate(): ValidationResult;
  public abstract get fieldType(): SettingFieldType;
}
