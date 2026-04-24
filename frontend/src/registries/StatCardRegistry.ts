import {
  Activity,
  FileText,
  FolderKanban,
  Users,
} from "lucide-react";

import { StatCard } from "@/models/StatCard";

export class StatCardRegistry {
  private static readonly cards: StatCard[] = [
    new StatCard("users", "Total Users", "1,234", "+12% from last month", "up", "#1f6feb", Users),
    new StatCard("projects", "Total Projects", "567", "+8% from last month", "up", "#388bfd", FolderKanban),
    new StatCard("jobs", "Active Jobs", "23", "Processing now", "neutral", "#8957e5", Activity),
    new StatCard("reports", "Reports Generated", "892", "+24% from last month", "up", "#da3633", FileText),
  ];

  public static getAll(): StatCard[] {
    return [...StatCardRegistry.cards];
  }
}
