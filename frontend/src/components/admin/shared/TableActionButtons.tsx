import { Pencil, Trash2 } from "lucide-react";

type TableActionButtonsProps = {
  onEdit: () => void;
  onDelete: () => void;
};

export const TableActionButtons = ({
  onEdit,
  onDelete,
}: TableActionButtonsProps): JSX.Element => {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-[6px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card-hover)] p-1.5 text-[color:var(--text-secondary)] transition-colors duration-150 hover:bg-[color:var(--border-subtle)] hover:text-white"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-[6px] border border-transparent bg-[rgba(218,54,51,0.15)] p-1.5 text-[#f85149] transition-colors duration-150 hover:bg-[#da3633] hover:text-white"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};
