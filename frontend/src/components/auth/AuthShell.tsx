/** This component renders the simple older auth shell used by the public access pages. */
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_22%)]" />
      <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900/90 p-8 shadow-[0_30px_100px_-40px_rgba(16,185,129,0.45)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-400">Road Quality Assessment</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
};
