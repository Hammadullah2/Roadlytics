import { apiClient } from "@/lib/apiClient";
import type { BackendJob, BackendProject, BackendRegion, BackendReport, Job, Project, Region, Report } from "@/types";
import { normalizeJob, normalizeProject, normalizeRegion, normalizeReport } from "@/types";

export type JobRecord = {
  job: Job;
  region: Region;
  project: Project;
};

export type ReportRecord = {
  report: Report;
  job: Job;
  region: Region;
  project: Project;
};

const sortByCreatedAtDesc = <T extends { created_at: string }>(left: T, right: T): number => {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
};

const toArray = <T,>(value: T[] | null | undefined): T[] => {
  return Array.isArray(value) ? value : [];
};

export const fetchProjects = async (): Promise<Project[]> => {
  const projects = await apiClient.get<BackendProject[]>("/projects");
  return toArray(projects).map(normalizeProject).sort(sortByCreatedAtDesc);
};

export const fetchRegionsForProject = async (projectID: string): Promise<Region[]> => {
  const regions = await apiClient.get<BackendRegion[]>(`/projects/${projectID}/regions`);
  return toArray(regions).map(normalizeRegion).sort(sortByCreatedAtDesc);
};

export const fetchAllRegions = async (): Promise<Region[]> => {
  const projects = await fetchProjects();
  const regionLists = await Promise.all(projects.map(async (project) => fetchRegionsForProject(project.id)));
  return regionLists.flat().sort(sortByCreatedAtDesc);
};

export const fetchJobRecords = async (): Promise<JobRecord[]> => {
  const projects = await fetchProjects();
  const records = await Promise.all(
    projects.map(async (project) => {
      const regions = await fetchRegionsForProject(project.id);

      const jobsByRegion = await Promise.all(
        regions.map(async (region) => {
          const jobs = await apiClient.get<BackendJob[]>(`/regions/${region.id}/jobs`);
          return toArray(jobs).map(normalizeJob).map((job) => ({
            job,
            region,
            project,
          }));
        }),
      );

      return jobsByRegion.flat();
    }),
  );

  return records.flat().sort((left, right) => sortByCreatedAtDesc(left.job, right.job));
};

export const fetchReportRecords = async (): Promise<ReportRecord[]> => {
  const [jobRecords, reports] = await Promise.all([
    fetchJobRecords(),
    apiClient.get<BackendReport[]>("/reports"),
  ]);
  const jobRecordByJobID = new Map(jobRecords.map((record) => [record.job.id, record]));

  return toArray(reports)
    .map(normalizeReport)
    .map((report) => {
      const jobRecord = jobRecordByJobID.get(report.job_id);
      if (!jobRecord) {
        return null;
      }

      return {
        report,
        job: jobRecord.job,
        region: jobRecord.region,
        project: jobRecord.project,
      };
    })
    .filter((record): record is ReportRecord => record !== null)
    .sort((left, right) => sortByCreatedAtDesc(left.report, right.report));
};
