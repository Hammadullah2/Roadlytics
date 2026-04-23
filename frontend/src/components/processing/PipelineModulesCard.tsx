import { PipelineModuleRow, type PipelineModuleRowData } from "@/components/processing/PipelineModuleRow";

type PipelineModulesCardProps = {
  modules: PipelineModuleRowData[];
};

class PipelineModulesCardCopy {
  public static readonly title = "Pipeline Modules:";
}

export const PipelineModulesCard = ({
  modules,
}: PipelineModulesCardProps): JSX.Element => {
  return (
    <section className="rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] px-6 py-5">
      <h2 className="mb-3.5 text-sm font-semibold text-[color:var(--text-primary)]">
        {PipelineModulesCardCopy.title}
      </h2>

      <div className="space-y-2.5">
        {modules.map((module) => (
          <PipelineModuleRow
            key={module.id}
            module={module}
          />
        ))}
      </div>
    </section>
  );
};
