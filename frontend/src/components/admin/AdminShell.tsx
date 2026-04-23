import type { ReactNode } from "react";

type AdminShellProps = {
  topbar: ReactNode;
  children: ReactNode;
};

export const AdminShell = ({
  topbar,
  children,
}: AdminShellProps): JSX.Element => {
  return (
    <div className="flex h-screen flex-col bg-[color:var(--bg-primary)]">
      {topbar}
      <main className="flex-1 overflow-y-auto bg-[color:var(--bg-primary)]">
        <div className="mx-auto box-border w-full max-w-[1400px] px-12 py-8">
          {children}
        </div>
      </main>
    </div>
  );
};
