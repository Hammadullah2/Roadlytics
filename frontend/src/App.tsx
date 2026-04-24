import { Navigate, Route, Routes } from "react-router-dom";

import { ApprovalGuard } from "@/components/auth/ApprovalGuard";
import { AdminLoginPage } from "@/components/auth/AdminLoginPage";
import { LoginPage } from "@/components/auth/LoginPage";
import { PendingApprovalPage } from "@/components/auth/PendingApprovalPage";
import { RegisterPage } from "@/components/auth/RegisterPage";
import { AdminPage } from "@/components/admin/AdminPage";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { AppShell } from "@/components/layout/AppShell";
import { MapAnalysisPage } from "@/components/map-analysis/MapAnalysisPage";
import { ProcessingPage } from "@/components/processing/ProcessingPage";
import { ProjectDetailPage, ProjectsPage } from "@/components/projects/ProjectsPage";
import { ReportDetailPage } from "@/components/reports/ReportDetailPage";
import { ReportsPage } from "@/components/reports/ReportsPage";
import { UploadPage } from "@/components/upload/UploadPage";

const ShellRoutes = (): JSX.Element => {
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/map-analysis" element={<MapAnalysisPage />} />
        <Route path="/processing" element={<ProcessingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:id" element={<ReportDetailPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route
          path="/admin"
          element={(
            <ApprovalGuard>
              <AdminPage />
            </ApprovalGuard>
          )}
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
};

export const App = (): JSX.Element => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/admin" element={<AdminLoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pending" element={<PendingApprovalPage />} />
      <Route path="*" element={<ShellRoutes />} />
    </Routes>
  );
};
