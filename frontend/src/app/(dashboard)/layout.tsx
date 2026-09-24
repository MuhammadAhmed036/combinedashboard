"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { BackendStatusBanner } from "@/components/layout/BackendStatusBanner";
import { CreateAlertModal } from "@/components/alerts/CreateAlertModal";
import { AlertWatcherMount } from "@/components/alerts/AlertWatcherMount";
import { NoPersonWatcherMount } from "@/components/alerts/NoPersonWatcherMount";
import { CameraAutoSyncMount } from "@/components/map/CameraAutoSyncMount";

function SharedDashboardServices() {
  return (
    <>
      <CreateAlertModal />
      <AlertWatcherMount />
      <NoPersonWatcherMount />
      <CameraAutoSyncMount />
    </>
  );
}

export default function DashboardShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isCommandWall = pathname === "/dashboard";

  if (isCommandWall) {
    return (
      <div className="min-h-screen w-full overflow-hidden bg-surface-1">
        <main className="h-screen overflow-hidden">{children}</main>
        <SharedDashboardServices />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-surface-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <BackendStatusBanner />
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
      <SharedDashboardServices />
    </div>
  );
}
