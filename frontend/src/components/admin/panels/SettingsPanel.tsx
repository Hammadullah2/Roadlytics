import { useMemo, useState } from "react";

import { SystemSettingsController } from "@/controllers/SystemSettingsController";
import { PasswordField } from "@/models/settings/PasswordField";
import { TextField } from "@/models/settings/TextField";
import { ToggleField } from "@/models/settings/ToggleField";
import { SettingsSectionCard } from "@/components/admin/settings/SettingsSectionCard";
import { ApiKeyRow } from "@/components/admin/settings/ApiKeyRow";
import { SaveToast } from "@/components/admin/settings/SaveToast";
import { SettingsActionBar } from "@/components/admin/settings/SettingsActionBar";
import { TextSettingRow } from "@/components/admin/settings/TextSettingRow";
import { ToggleSettingRow } from "@/components/admin/settings/ToggleSettingRow";

type SettingsPanelProps = {
  controller: SystemSettingsController;
};

class SettingsPanelCopy {
  public static readonly title = "System Settings";
}

class FieldTypeGuards {
  public static isTextField(field: unknown): field is TextField {
    return field instanceof TextField;
  }

  public static isPasswordField(field: unknown): field is PasswordField {
    return field instanceof PasswordField;
  }

  public static isToggleField(field: unknown): field is ToggleField {
    return field instanceof ToggleField;
  }
}

export const SettingsPanel = ({ controller }: SettingsPanelProps): JSX.Element => {
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => controller.getSections(), [controller]);

  if (controller.isLoading) {
    return (
      <section className="rounded-[14px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5 text-[0.95rem] text-[color:var(--text-secondary)]">
        Loading system settings...
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-5 text-[1.25rem] font-bold text-[color:var(--text-primary)]">
        {SettingsPanelCopy.title}
      </h1>

      {controller.errorMessage ? (
        <div className="mb-4 rounded-[10px] border border-[#f85149]/30 bg-[#f85149]/10 px-4 py-3 text-sm text-[#fda4af]">
          {controller.errorMessage}
        </div>
      ) : null}

      <div className="space-y-4">
        {sections.map((section) => (
          <SettingsSectionCard key={section.id} section={section}>
            {section.fields.map((field) => {
              if (FieldTypeGuards.isPasswordField(field)) {
                return (
                  <ApiKeyRow
                    key={field.id}
                    field={field}
                    isTouched={touchedFields[field.id] === true}
                    onChange={(id, value) => controller.updateField(id, value)}
                    onToggleMask={() => controller.toggleApiKeyMask()}
                    onTouched={(id) =>
                      setTouchedFields((current) => ({ ...current, [id]: true }))
                    }
                  />
                );
              }

              if (FieldTypeGuards.isToggleField(field)) {
                return (
                  <ToggleSettingRow
                    key={field.id}
                    field={field}
                    onToggle={(id) => controller.toggleField(id)}
                  />
                );
              }

              if (FieldTypeGuards.isTextField(field)) {
                return (
                  <TextSettingRow
                    key={field.id}
                    field={field}
                    isTouched={touchedFields[field.id] === true}
                    onChange={(id, value) => controller.updateField(id, value)}
                    onTouched={(id) =>
                      setTouchedFields((current) => ({ ...current, [id]: true }))
                    }
                  />
                );
              }

              return null;
            })}
          </SettingsSectionCard>
        ))}
      </div>

      <SettingsActionBar
        canSave={controller.canSave}
        isSaving={controller.isSaving}
        onReset={() => {
          void controller.resetToDefault();
          setTouchedFields({});
        }}
        onSave={() => {
          void controller.saveChanges();
        }}
      />

      {controller.saveMessage ? <SaveToast message={controller.saveMessage} /> : null}
    </section>
  );
};
