import { Bell, KeyRound, ShieldCheck } from "lucide-react";

import { PasswordField } from "@/models/settings/PasswordField";
import { SettingsSection } from "@/models/settings/SettingsSection";
import { TextField } from "@/models/settings/TextField";
import { ToggleField } from "@/models/settings/ToggleField";

type SettingsPayload = Record<string, string | boolean>;

export class SystemSettingsModel {
  public readonly generalSection: SettingsSection;
  public readonly apiSection: SettingsSection;
  public readonly notificationSection: SettingsSection;
  public readonly securitySection: SettingsSection;

  public constructor() {
    this.generalSection = new SettingsSection("general", "General Settings", null, [
      new TextField(
        "platform-name",
        "Platform Name",
        "AI-Driven Road Assessment Platform",
        3,
        100,
        "text",
      ),
      new TextField(
        "admin-email",
        "Admin Email",
        "admin@platform.com",
        5,
        255,
        "email",
      ),
      new TextField(
        "max-upload",
        "Max Upload Size (MB)",
        "100",
        1,
        10,
        "number",
      ),
    ]);

    this.apiSection = new SettingsSection("api", "API Configuration", KeyRound, [
      new PasswordField(
        "satellite-api-key",
        "Satellite API Key",
        "••••••••••••••••••••",
      ),
      new TextField(
        "api-rate-limit",
        "API Rate Limit (requests/hour)",
        "1000",
        1,
        10,
        "number",
      ),
    ]);

    this.notificationSection = new SettingsSection(
      "notifications",
      "Notification Settings",
      Bell,
      [
        new ToggleField("notif-new-users", "Email notifications for new users", true),
        new ToggleField("notif-sys-errors", "Email notifications for system errors", true),
        new ToggleField("notif-analytics", "Weekly analytics reports", false),
      ],
    );

    this.securitySection = new SettingsSection("security", "Security Settings", ShieldCheck, [
      new ToggleField("sec-2fa", "Enable two-factor authentication", false),
      new ToggleField("sec-pwd-rotation", "Require password change every 90 days", false),
      new ToggleField("sec-session", "Enable session timeout after 30 minutes", true),
    ]);
  }

  public getAllSections(): SettingsSection[] {
    return [
      this.generalSection,
      this.apiSection,
      this.notificationSection,
      this.securitySection,
    ];
  }

  public get isAnyDirty(): boolean {
    return this.getAllSections().some((section) => section.isDirty);
  }

  public get isAllValid(): boolean {
    return this.getAllSections().every((section) => section.isValid());
  }

  public resetAll(): void {
    this.getAllSections().forEach((section) => section.reset());
  }

  public applyPayload(payload: SettingsPayload): void {
    this.getAllSections().forEach((section) => {
      section.fields.forEach((field) => {
        const incoming = payload[field.id];
        if (typeof field.value === "string" && typeof incoming === "string") {
          field.syncValue(incoming);
          return;
        }

        if (typeof field.value === "boolean" && typeof incoming === "boolean") {
          field.syncValue(incoming);
        }
      });
    });
  }

  public toPayload(): SettingsPayload {
    const payload: SettingsPayload = {};
    this.getAllSections().forEach((section) => {
      section.fields.forEach((field) => {
        payload[field.id] = field.value;
      });
    });
    return payload;
  }
}
