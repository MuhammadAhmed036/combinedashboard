import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MapPin,
  MonitorPlay,
  AlertTriangle,
  Video,
  ScanLine,
  BarChart3,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "alerts";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map-view", label: "Map View", icon: MapPin },
  { href: "/media-wall", label: "Media Wall", icon: MonitorPlay },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, badgeKey: "alerts" },
  { href: "/cameras", label: "Cameras", icon: Video },
  { href: "/zones", label: "Zones", icon: ScanLine },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];
