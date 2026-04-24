import { adminClient } from "@/lib/adminClient";
import { SystemSettingsModel } from "@/models/settings/SystemSettingsModel";
import type { AdminSettingsPayload } from "@/types";

type SaveResult = {
  success: boolean;
  message: string;
  payload: SettingsPayload;
};

type SettingsPayload = AdminSettingsPayload;

export class SettingsSaveService {
  private static instance: SettingsSaveService | null = null;

  private constructor() {}

  public static getInstance(): SettingsSaveService {
    if (SettingsSaveService.instance === null) {
      SettingsSaveService.instance = new SettingsSaveService();
    }

    return SettingsSaveService.instance;
  }

  public async save(payload: SettingsPayload): Promise<SaveResult> {
    const saved = await adminClient.updateSettings(payload);
    return {
      success: true,
      message: "Settings saved successfully",
      payload: saved,
    };
  }

  public async load(): Promise<SettingsPayload> {
    return adminClient.getSettings();
  }

  public async resetToDefault(model: SystemSettingsModel): Promise<void> {
    model.resetAll();
    const saved = await adminClient.updateSettings(model.toPayload());
    model.applyPayload(saved);
  }
}
