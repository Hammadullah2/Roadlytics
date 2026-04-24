import type { ReactNode } from "react";

import { SettingsSection } from "@/models/settings/SettingsSection";

type SettingsSectionCardProps = {
  section: SettingsSection;
  children: ReactNode;
};

export const SettingsSectionCard = ({
  section,
  children,
}: SettingsSectionCardProps): JSX.Element => {
  const Icon = section.icon;

  return (
    <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-6">
      <div className="mb-5 flex items-center gap-2">
        {Icon ? <Icon size={16} color="var(--text-secondary)" /> : null}
        <h2 className="text-[0.95rem] font-bold text-[color:var(--text-primary)]">
          {section.title}
        </h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
};
