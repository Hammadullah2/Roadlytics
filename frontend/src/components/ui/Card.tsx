/** This component renders a reusable dark theme card container. */
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const Card = ({ children, className = "", ...props }: CardProps) => {
  return (
    <div
      className={`rounded-3xl border border-slate-800 bg-slate-900/80 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.25)] backdrop-blur ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
