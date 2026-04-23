import { X } from "lucide-react";

type ModalHeaderProps = {
  title: string;
  onClose: () => void;
};

export const ModalHeader = ({ title, onClose }: ModalHeaderProps): JSX.Element => {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h2
        id="upload-satellite-imagery-title"
        className="text-xl font-bold text-[color:var(--text-primary)]"
      >
        {title}
      </h2>

      <button
        type="button"
        onClick={onClose}
        className="text-[color:var(--text-secondary)] transition-colors duration-150 hover:text-white"
        aria-label="Close upload modal"
      >
        <X size={20} />
      </button>
    </div>
  );
};
