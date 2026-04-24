"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    hint: "Overview",
  },
  {
    href: "/projects",
    label: "Projects",
    hint: "Assessments",
  },
  {
    href: "/processing",
    label: "Processing",
    hint: "Live jobs",
  },
  {
    href: "/map",
    label: "Map Analysis",
    hint: "Layers",
  },
  {
    href: "/reports",
    label: "Reports",
    hint: "Exports",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RL</div>
          <div className="brand-copy">
            <strong>Roadlytics</strong>
            <span>Road intelligence studio</span>
          </div>
        </div>

        <nav className="nav-stack">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-link", pathname === item.href && "active")}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </Link>
          ))}
        </nav>

        <div className="sidebar-card">
          <strong>Phase 1 Scope</strong>
          Upload a Sentinel-2 GeoTIFF, choose segmentation and classification models,
          inspect the outputs on the map, and download analytics, rasters, and shapefiles.
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
