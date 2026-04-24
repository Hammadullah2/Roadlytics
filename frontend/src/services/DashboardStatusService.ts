import { StatusItem } from "@/models/StatusItem";

export class DashboardStatusService {
  private static instance: DashboardStatusService | null = null;

  private constructor() {}

  public static getInstance(): DashboardStatusService {
    if (DashboardStatusService.instance === null) {
      DashboardStatusService.instance = new DashboardStatusService();
    }

    return DashboardStatusService.instance;
  }

  public async fetchStatus(): Promise<StatusItem[]> {
    const delayInMilliseconds = 450;

    return new Promise<StatusItem[]>((resolve) => {
      window.setTimeout(() => {
        resolve([
          new StatusItem("Pending Jobs", 2),
          new StatusItem("Completed Reports", 12),
          new StatusItem("New Satellite Imagery Available", 3),
        ]);
      }, delayInMilliseconds);
    });
  }
}
