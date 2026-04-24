import { createContext, useContext } from "react";

import { ReportsPageController } from "@/controllers/ReportsPageController";

const ReportsControllerContext = createContext<ReportsPageController | null>(null);

type ReportsControllerProviderProps = {
  controller: ReportsPageController;
  children: React.ReactNode;
};

export const ReportsControllerProvider = ({
  controller,
  children,
}: ReportsControllerProviderProps): JSX.Element => {
  return (
    <ReportsControllerContext.Provider value={controller}>
      {children}
    </ReportsControllerContext.Provider>
  );
};

export const useReportsController = (): ReportsPageController => {
  const controller = useContext(ReportsControllerContext);

  if (controller === null) {
    throw new Error("Reports controller context is unavailable");
  }

  return controller;
};
