"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { useUIStore } from "@/lib/store/useUIStore";
import { useUnseenAlertMatchCount } from "@/lib/hooks/useAlertRules";

function NavLink({
  href,
  label,
  Icon,
  active,
  collapsed,
  badgeCount,
  onNavigate,
}: {
  href: string;
  label: string;
  Icon: (typeof NAV_ITEMS)[number]["icon"];
  active: boolean;
  collapsed: boolean;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-primary/15 text-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
      title={collapsed ? label : undefined}
    >
      <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badgeCount ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white">
          {badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const alertCount = useUnseenAlertMatchCount();

  const content = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4",
          sidebarCollapsed && "justify-center px-2"
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
          <ShieldCheck className="size-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">Intellivision</div>
            <div className="text-xs text-muted-foreground">Command Center</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
            collapsed={sidebarCollapsed}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            badgeCount={item.badgeKey === "alerts" ? alertCount : undefined}
            onNavigate={() => setMobileNavOpen(false)}
          />
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:block",
          sidebarCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        {content}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}
