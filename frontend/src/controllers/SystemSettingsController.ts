import { PasswordField } from "@/models/settings/PasswordField";
import {
  type SettingsField,
  SettingsSection,
} from "@/models/settings/SettingsSection";
import { SystemSettingsModel } from "@/models/settings/SystemSettingsModel";
import { ToggleField } from "@/models/settings/ToggleField";
import { SettingsSaveService } from "@/services/SettingsSaveService";
import type { AdminSettingsPayload } from "@/types";

type SettingValue = string | boolean;

export class SystemSettingsController {
  private readonly model: SystemSettingsModel;
  private readonly saveService: SettingsSaveService;
  private _isSaving: boolean = false;
  private _isLoading: boolean = false;
  private _saveMessage: string | null = null;
  private _errorMessage: string | null = null;
  private onUpdate: (() => void) | null = null;

  public constructor() {
    this.model = new SystemSettingsModel();
    this.saveService = SettingsSaveService.getInstance();
  }

  public setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  public getSections(): SettingsSection[] {
    return this.model.getAllSections();
  }

  public getGeneralSection(): SettingsSection {
    return this.model.generalSection;
  }

  public getApiSection(): SettingsSection {
    return this.model.apiSection;
  }

  public getNotificationSection(): SettingsSection {
    return this.model.notificationSection;
  }

  public getSecuritySection(): SettingsSection {
    return this.model.securitySection;
  }

  public get isSaving(): boolean {
    return this._isSaving;
  }

  public get isLoading(): boolean {
    return this._isLoading;
  }

  public get saveMessage(): string | null {
    return this._saveMessage;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public get canSave(): boolean {
    return this.model.isAnyDirty && this.model.isAllValid;
  }

  public async load(): Promise<void> {
    this._isLoading = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const payload = await this.saveService.load();
      this.applyServerSettings(payload);
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to load settings.";
    } finally {
      this._isLoading = false;
      this.notifyUpdate();
    }
  }

  public updateField(fieldId: string, value: SettingValue): void {
    const field = this.findFieldById(fieldId);
    if (!field) {
      return;
    }

    if (typeof field.value === "string" && typeof value === "string") {
      field.setValue(value);
      this.notifyUpdate();
      return;
    }

    if (typeof field.value === "boolean" && typeof value === "boolean") {
      field.setValue(value);
      this.notifyUpdate();
    }
  }

  public toggleField(fieldId: string): void {
    const field = this.findFieldById(fieldId);
    if (field instanceof ToggleField) {
      field.toggle();
      this.notifyUpdate();
    }
  }

  public toggleApiKeyMask(): void {
    const field = this.findFieldById("satellite-api-key");
    if (field instanceof PasswordField) {
      field.toggleMask();
      this.notifyUpdate();
    }
  }

  public async saveChanges(): Promise<void> {
    if (!this.canSave) {
      return;
    }

    this._isSaving = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      const result = await this.saveService.save(this.model.toPayload());
      this.applyServerSettings(result.payload);
      this._saveMessage = result.message;
      this.scheduleMessageClear();
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to save settings.";
    } finally {
      this._isSaving = false;
      this.notifyUpdate();
    }
  }

  public async resetToDefault(): Promise<void> {
    this._isSaving = true;
    this._errorMessage = null;
    this.notifyUpdate();

    try {
      await this.saveService.resetToDefault(this.model);
      this._saveMessage = "Settings reset to default";
      this.scheduleMessageClear();
    } catch (error: unknown) {
      this._errorMessage =
        error instanceof Error ? error.message : "Failed to reset settings.";
    } finally {
      this._isSaving = false;
      this.notifyUpdate();
    }
  }

  private applyServerSettings(payload: AdminSettingsPayload): void {
    this.model.applyPayload(payload);
  }

  private findFieldById(fieldId: string): SettingsField | null {
    for (const section of this.model.getAllSections()) {
      const found = section.fields.find((field) => field.id === fieldId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private scheduleMessageClear(): void {
    window.setTimeout(() => {
      this._saveMessage = null;
      this.notifyUpdate();
    }, 3000);
  }

  private notifyUpdate(): void {
    if (this.onUpdate) {
      this.onUpdate();
    }
  }
}
