import type { ReactNode } from "react";

type AdminShellProps = {
  topbar: ReactNode;
  children: ReactNode;
};

export const AdminShell = ({ topbar, children }: AdminShellProps): JSX.Element => {
  return (
    <div>
      {topbar}
      {children}
    </div>
  );
};
