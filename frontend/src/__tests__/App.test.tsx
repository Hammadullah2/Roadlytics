import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

import { App } from "@/App";

jest.mock("@/components/admin/AdminPage", () => ({
  AdminPage: () => <div>admin-page</div>,
}));

jest.mock("@/components/auth/ApprovalGuard", () => ({
  ApprovalGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/auth/AdminLoginPage", () => ({
  AdminLoginPage: () => <div>admin-login-page</div>,
}));

jest.mock("@/components/auth/LoginPage", () => ({
  LoginPage: () => <div>login-page</div>,
}));

jest.mock("@/components/auth/PendingApprovalPage", () => ({
  PendingApprovalPage: () => <div>pending-page</div>,
}));

jest.mock("@/components/auth/RegisterPage", () => ({
  RegisterPage: () => <div>register-page</div>,
}));

jest.mock("@/components/dashboard/DashboardPage", () => ({
  DashboardPage: () => <div>dashboard-page</div>,
}));

jest.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/components/map-analysis/MapAnalysisPage", () => ({
  MapAnalysisPage: () => <div>map-analysis-page</div>,
}));

jest.mock("@/components/map-analysis/ProjectMapPage", () => ({
  ProjectMapPage: () => <div>project-map-page</div>,
}));

jest.mock("@/components/projects/ProjectCreationPage", () => ({
  ProjectCreationPage: () => <div>project-creation-page</div>,
}));

jest.mock("@/components/processing/ProcessingPage", () => ({
  ProcessingPage: () => <div>processing-page</div>,
}));

jest.mock("@/components/projects/ProjectsPage", () => ({
  ProjectsPage: () => <div>projects-page</div>,
  ProjectDetailPage: () => <div>project-detail-page</div>,
}));

jest.mock("@/components/reports/ReportDetailPage", () => ({
  ReportDetailPage: () => <div>report-detail-page</div>,
}));

jest.mock("@/components/reports/ReportsPage", () => ({
  ReportsPage: () => <div>reports-page</div>,
}));

jest.mock("@/components/upload/UploadPage", () => ({
  UploadPage: () => <div>upload-page</div>,
}));

const LocationDisplay = (): JSX.Element => {
  const location = useLocation();

  return <div data-testid="location-display">{location.pathname}</div>;
};

describe("App", () => {
  it("redirects the root route to /login", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
        <LocationDisplay />
      </MemoryRouter>,
    );

    expect(screen.getByText("login-page")).toBeInTheDocument();
    expect(screen.getByTestId("location-display")).toHaveTextContent("/login");
  });
});
