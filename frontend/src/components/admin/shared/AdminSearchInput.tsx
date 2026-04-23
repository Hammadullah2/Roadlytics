import { Search } from "lucide-react";

type AdminSearchInputProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export const AdminSearchInput = ({
  value,
  placeholder,
  onChange,
}: AdminSearchInputProps): JSX.Element => {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[color:var(--text-nav-label)]">
        <Search size={16} />
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-[42px] w-full rounded-[8px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] pl-10 pr-4 text-[0.875rem] text-[color:var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[color:var(--text-nav-label)] focus:border-[color:var(--accent-green)]"
      />
    </div>
  );
};
