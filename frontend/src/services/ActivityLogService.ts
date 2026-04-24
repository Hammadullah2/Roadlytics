import { ActivityEntry } from "@/models/ActivityEntry";

export class ActivityLogService {
  private static instance: ActivityLogService | null = null;
  private readonly entries: ActivityEntry[];

  private constructor() {
    this.entries = [
      new ActivityEntry("1", "user@example.com", "Uploaded Image", "Project 12", "2 minutes ago"),
      new ActivityEntry("2", "admin@example.com", "Generated Report", "Project 8", "15 minutes ago"),
      new ActivityEntry("3", "guest_user_123", "Started Segmentation", "Guest Session", "1 hour ago"),
      new ActivityEntry("4", "user2@example.com", "Created Project", "Project 15", "3 hours ago"),
      new ActivityEntry("5", "analyst@example.com", "Downloaded Report", "Project 6", "5 hours ago"),
    ];
  }

  public static getInstance(): ActivityLogService {
    if (ActivityLogService.instance === null) {
      ActivityLogService.instance = new ActivityLogService();
    }

    return ActivityLogService.instance;
  }

  public getRecent(limit: number = 5): ActivityEntry[] {
    return this.entries.slice(0, limit);
  }

  public getAll(): ActivityEntry[] {
    return [...this.entries];
  }
}
