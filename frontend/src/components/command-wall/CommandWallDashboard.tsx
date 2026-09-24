"use client";

import { AlertRail } from "@/components/command-wall/AlertRail";
import { LeftReservedRail } from "@/components/command-wall/LeftReservedRail";
import { MediaWallPanel } from "@/components/command-wall/MediaWallPanel";
import { useAlertRules } from "@/lib/hooks/useAlertRules";
import { useCameras } from "@/lib/hooks/useCameras";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";

export function CommandWallDashboard() {
  const { data: cameras, isLoading: camerasLoading } = useCameras();
  const { data: rules, isLoading: alertsLoading, error: alertsError } = useAlertRules();
  const liveOccupancy = useLiveCameraOccupancy();

  return (
    <div className="h-screen overflow-hidden bg-surface-1">
      <div className="grid size-full grid-rows-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)] lg:grid-cols-[15fr_70fr_15fr] lg:grid-rows-1">
        <LeftReservedRail />
        <MediaWallPanel
          cameras={cameras}
          rules={rules ?? []}
          liveOccupancy={liveOccupancy}
          isLoading={camerasLoading}
        />
        <AlertRail rules={rules} isLoading={alertsLoading} error={alertsError} />
      </div>
    </div>
  );
}


