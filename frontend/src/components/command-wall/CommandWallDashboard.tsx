"use client";

import { AlertRail } from "@/components/command-wall/AlertRail";
import { LunaEventsRail } from "@/components/luna/LunaEventsRail";
import { MediaWallPanel } from "@/components/command-wall/MediaWallPanel";
import { useCameras } from "@/lib/hooks/useCameras";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";

export function CommandWallDashboard() {
  const { data: cameras, isLoading: camerasLoading } = useCameras();
  const liveOccupancy = useLiveCameraOccupancy();

  return (
    <div className="h-screen overflow-hidden bg-surface-1">
      <div className="grid size-full grid-rows-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)] lg:grid-cols-[15fr_70fr_15fr] lg:grid-rows-1">
        <LunaEventsRail />
        <MediaWallPanel
          cameras={cameras}
          liveOccupancy={liveOccupancy}
          isLoading={camerasLoading}
        />
        <AlertRail cameras={cameras} />
      </div>
    </div>
  );
}
