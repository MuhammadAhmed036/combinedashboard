"use client";

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
  return (
    <div className="min-h-screen w-full overflow-hidden bg-surface-1">
      <main className="h-screen overflow-hidden">{children}</main>
      <SharedDashboardServices />
    </div>
  );
}
