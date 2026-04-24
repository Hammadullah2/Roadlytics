"use client";

import { cn } from "@/lib/utils";

export function StatusPill({ status }: { status: string }) {
  return <span className={cn("status-pill", status)}>{status}</span>;
}

