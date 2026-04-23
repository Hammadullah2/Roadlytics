import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { QuickActionsSection } from "@/components/dashboard/QuickActionsSection";
import { StatusSummarySection } from "@/components/dashboard/StatusSummarySection";
import { UploadModal } from "@/components/modals/UploadModal";
import { ModalController } from "@/controllers/ModalController";
import { useJobRecords } from "@/hooks/useJobRecords";
import { useProjects } from "@/hooks/useProjects";
import { useReportRecords } from "@/hooks/useReportRecords";
import {
  SATELLITE_UPLOAD_DRAW_QUERY_PARAM,
  SATELLITE_UPLOAD_DRAW_QUERY_VALUE,
  SATELLITE_UPLOAD_QUERY_PARAM,
  SATELLITE_UPLOAD_QUERY_VALUE,
  SATELLITE_UPLOAD_RETURN_TO_QUERY_PARAM,
  buildSatelliteUploadReturnPath,
  clearSatelliteUploadDraft,
  writeSatelliteUploadDraft,
} from "@/lib/satelliteUploadDraft";
import { UploadFormState } from "@/models/UploadFormState";
import { QuickAction } from "@/models/QuickAction";
import { StatusItem } from "@/models/StatusItem";

class DashboardPageCopy {
  public static readonly title = "Dashboard";
}

export const DashboardPage = (): JSX.Element => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { projects, isLoading: isProjectsLoading, error: projectsError } = useProjects();
  const { jobs, isLoading: isJobsLoading, error: jobsError } = useJobRecords();
  const { reports, isLoading: isReportsLoading, error: reportsError } = useReportRecords();
  const [uploadModalController, setUploadModalController] = useState<ModalController>(() => new ModalController());
  const shouldOpenUploadModal = searchParams.get(SATELLITE_UPLOAD_QUERY_PARAM) === SATELLITE_UPLOAD_QUERY_VALUE;

  const statusItems = [
    new StatusItem("Total Projects", projects.length),
    new StatusItem("Active Jobs", jobs.filter((job) => job.status === "pending" || job.status === "running").length),
    new StatusItem("Completed Jobs", jobs.filter((job) => job.status === "completed").length),
    new StatusItem("Total Reports", reports.length),
  ];
  const statusError = projectsError ?? jobsError ?? reportsError ?? null;
  const statusLoading = isProjectsLoading || isJobsLoading || isReportsLoading;

  useEffect(() => {
    if (!shouldOpenUploadModal) {
      return;
    }

    setUploadModalController((currentController) => {
      if (currentController.isOpen || currentController.isClosing) {
        return currentController;
      }

      const nextController = currentController.clone();
      nextController.open();
      return nextController;
    });
  }, [shouldOpenUploadModal]);

  const handleQuickActionClick = (action: QuickAction): boolean => {
    if (action.route !== "/upload") {
      return false;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set(SATELLITE_UPLOAD_QUERY_PARAM, SATELLITE_UPLOAD_QUERY_VALUE);
    setSearchParams(nextParams, { replace: true });

    return true;
  };

  const handleCloseUploadModal = (): void => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete(SATELLITE_UPLOAD_QUERY_PARAM);
    setSearchParams(nextParams, { replace: true });

    setUploadModalController((currentController) => {
      const nextController = currentController.clone();
      nextController.beginClose();
      return nextController;
    });
  };

  const handleUploadModalExited = (): void => {
    setUploadModalController((currentController) => {
      const nextController = currentController.clone();
      nextController.close();
      return nextController;
    });

    clearSatelliteUploadDraft();
  };

  const handleSelectUploadRegion = (formState: UploadFormState): void => {
    writeSatelliteUploadDraft(formState);

    const nextParams = new URLSearchParams({
      [SATELLITE_UPLOAD_DRAW_QUERY_PARAM]: SATELLITE_UPLOAD_DRAW_QUERY_VALUE,
      [SATELLITE_UPLOAD_RETURN_TO_QUERY_PARAM]: buildSatelliteUploadReturnPath(),
    });

    navigate(`/map-analysis?${nextParams.toString()}`);
  };

  return (
    <section className="min-h-[calc(100vh-52px)] bg-[color:var(--bg-primary)] p-8">
      <h1 className="mb-6 text-[1.75rem] font-bold text-[color:var(--text-primary)]">
        {DashboardPageCopy.title}
      </h1>

      <QuickActionsSection
        onActionClick={handleQuickActionClick}
      />
      <StatusSummarySection items={statusItems} loading={statusLoading} error={statusError} />

      {uploadModalController.isOpen || uploadModalController.isClosing ? (
        <UploadModal
          controller={uploadModalController}
          onClose={handleCloseUploadModal}
          onExited={handleUploadModalExited}
          onSuccess={() => { navigate("/processing"); }}
          onSelectRegionClick={handleSelectUploadRegion}
        />
      ) : null}
    </section>
  );
};
