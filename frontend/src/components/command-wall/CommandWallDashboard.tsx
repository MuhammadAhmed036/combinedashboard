"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertRail } from "@/components/command-wall/AlertRail";
import { LunaEventsRail } from "@/components/luna/LunaEventsRail";
import { MediaWallPanel } from "@/components/command-wall/MediaWallPanel";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { useCameras } from "@/lib/hooks/useCameras";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";
import { useUIStore } from "@/lib/store/useUIStore";
import type { Camera } from "@/lib/types";

const STORAGE_KEY = "safecity_mediawall_custom_config";

export function CommandWallDashboard() {
  const { data: cameras, isLoading: camerasLoading } = useCameras();
  const liveOccupancy = useLiveCameraOccupancy();
  const assignCameraToCell = useUIStore((s) => s.assignCameraToCell);

  const [activeDragCamera, setActiveDragCamera] = useState<Camera | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    const camera = event.active.data.current?.camera as Camera | undefined;
    setActiveDragCamera(camera ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragCamera(null);
    const { active, over } = event;
    if (!over) return;

    const cameraId = String(active.id).replace("camera-", "");
    const cellIndex = Number(String(over.id).replace("cell-", ""));
    if (Number.isNaN(cellIndex)) return;

    assignCameraToCell(cellIndex, cameraId);

    try {
      const currentLayout = useUIStore.getState().mediaWallLayout;
      const currentAssignments = useUIStore.getState().mediaWallAssignments;
      const nextAssignments = [
        ...currentAssignments.filter((a) => a.cellIndex !== cellIndex),
        { cellIndex, cameraId },
      ];
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          layout: currentLayout,
          assignments: nextAssignments,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.error("Failed to save media wall config:", e);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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

      {/* Floating Drag Overlay */}
      <DragOverlay dropAnimation={null} zIndex={99999}>
        {activeDragCamera ? (
          <div className="flex w-56 items-center gap-2.5 rounded-lg border-2 border-cyan-400 bg-[#060a14]/95 p-2.5 shadow-[0_0_25px_rgba(6,182,212,0.85)] backdrop-blur-md pointer-events-none cursor-grabbing">
            <CameraThumbnail
              seed={activeDragCamera.thumbnailSeed}
              feedUrl={activeDragCamera.proxy_feed_url ?? activeDragCamera.proxyFeedUrl}
              playerUrl={activeDragCamera.playerUrl}
              offline={activeDragCamera.status === "offline"}
              className="size-9 shrink-0 rounded border border-cyan-400/50"
            />
            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-bold text-cyan-200">
                {activeDragCamera.name}
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                Drop to place on tile
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
