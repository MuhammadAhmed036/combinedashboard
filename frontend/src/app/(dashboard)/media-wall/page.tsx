"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { GridLayoutSwitch, gridDimensions } from "@/components/media-wall/GridLayoutSwitch";
import { DroppableCell } from "@/components/media-wall/DroppableCell";
import { CameraLibraryPanel } from "@/components/media-wall/CameraLibraryPanel";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCameras } from "@/lib/hooks/useCameras";
import { useZones } from "@/lib/hooks/useZones";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";
import { useUIStore } from "@/lib/store/useUIStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import type { Camera, GridLayoutKey } from "@/lib/types";

export default function MediaWallPage() {
  const { data: cameras } = useCameras();
  const { data: zones } = useZones();
  const liveOccupancy = useLiveCameraOccupancy();

  const layout = useUIStore((s) => s.mediaWallLayout);
  const setLayout = useUIStore((s) => s.setMediaWallLayout);
  const assignments = useUIStore((s) => s.mediaWallAssignments);
  const assignCameraToCell = useUIStore((s) => s.assignCameraToCell);
  const clearMediaWallAssignments = useUIStore((s) => s.clearMediaWallAssignments);

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [activeDragCamera, setActiveDragCamera] = useState<Camera | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dims = gridDimensions(layout);
  const cellCount = dims * dims;

  const cameraById = useMemo(() => {
    const map = new Map(cameras?.map((c) => [c.id, c]));
    return map;
  }, [cameras]);

  // The live people-count feed keys by the detection API's camera_id, while
  // this page's camera list comes from the separate live-stream API — the
  // two share the same camera names in practice, so match case-insensitively.
  const livePeopleCountByName = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(liveOccupancy).forEach((entry) => {
      map.set(entry.cameraId.toLowerCase(), entry.peopleCount);
      if (entry.cameraName) {
        map.set(entry.cameraName.toLowerCase(), entry.peopleCount);
      }
    });
    return map;
  }, [liveOccupancy]);

  const assignedCameraIds = useMemo(
    () => new Set(assignments.map((a) => a.cameraId).filter(Boolean) as string[]),
    [assignments]
  );

  useEffect(() => {
    // Only ever auto-populate the wall the very first time it's used — once
    // you've arranged anything (even one camera), this leaves it alone.
    // Previously this reset the whole layout whenever a currently-assigned
    // camera was momentarily missing from a poll of the live camera list,
    // which is exactly the "my layout doesn't stay" bug — an empty cell for
    // one missing camera is fine, silently wiping the whole arrangement isn't.
    if (!cameras?.length || assignments.length > 0) return;

    const workingCameras = cameras.filter((camera) => camera.status === "online");
    const autoCameras = workingCameras.length > 0 ? workingCameras : cameras;

    const autoLayout: GridLayoutKey =
      autoCameras.length > 9 ? "4x4" : autoCameras.length > 4 ? "3x3" : "2x2";
    setLayout(autoLayout);
    const autoCellCount = gridDimensions(autoLayout) ** 2;
    autoCameras
      .slice(0, autoCellCount)
      .forEach((camera, index) => assignCameraToCell(index, camera.id));
  }, [cameras, assignments.length, assignCameraToCell, setLayout]);

  function toggleFavorite(cameraId: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) next.delete(cameraId);
      else next.add(cameraId);
      return next;
    });
  }

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
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-[calc(100vh-4rem-2.25rem)] flex-col">
        <PageHeader
          title="Media Wall"
          description="Drag a camera from the library onto any tile — the layout saves automatically"
          actions={
            <>
              <GridLayoutSwitch
                value={layout}
                onChange={(v: GridLayoutKey) => setLayout(v)}
                options={["2x2", "3x3", "4x4"]}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={clearMediaWallAssignments}
              >
                <RotateCcw className="size-4" /> Reset
              </Button>
            </>
          }
        />

        <div className="grid flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_320px]">
          <div
            className="grid flex-1 gap-2"
            style={{
              gridTemplateColumns: `repeat(${dims}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${dims}, minmax(0, 1fr))`,
            }}
          >
            {!cameras &&
              Array.from({ length: cellCount }).map((_, i) => (
                <Skeleton key={i} className="h-full w-full rounded-lg" />
              ))}
            {cameras &&
              Array.from({ length: cellCount }).map((_, i) => {
                const assignment = assignments.find((a) => a.cellIndex === i);
                const camera = assignment?.cameraId ? cameraById.get(assignment.cameraId) ?? null : null;
                const livePeopleCount = camera
                  ? (livePeopleCountByName.get(camera.id.toLowerCase()) ??
                     livePeopleCountByName.get(camera.name.toLowerCase()) ??
                     livePeopleCountByName.get(camera.code.toLowerCase()) ??
                     livePeopleCountByName.get(resolveDetectionCameraId(camera.code ?? camera.id).toLowerCase()) ??
                     livePeopleCountByName.get(resolveDetectionCameraId(camera.name ?? camera.id).toLowerCase()) ??
                     null)
                  : null;
                const isHighOccupancy = livePeopleCount !== null && livePeopleCount !== undefined && livePeopleCount >= 5;
                return (
                  <div key={i} className="min-h-[90px]">
                    <DroppableCell
                      index={i}
                      camera={camera}
                      onClear={() => assignCameraToCell(i, null)}
                      hasAlert={isHighOccupancy}
                      livePeopleCount={livePeopleCount}
                    />
                  </div>
                );
              })}
          </div>

          <div className="h-[420px] overflow-hidden rounded-xl border border-surface-border lg:h-full">
            {cameras && zones ? (
              <CameraLibraryPanel
                cameras={cameras}
                zones={zones}
                favoriteIds={favoriteIds}
                onToggleFavorite={toggleFavorite}
                assignedCameraIds={assignedCameraIds}
              />
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDragCamera && (
          <div className="flex w-48 items-center gap-2 rounded-md border border-primary bg-surface-2 px-2 py-1.5 shadow-lg">
            <CameraThumbnail
              seed={activeDragCamera.thumbnailSeed}
              feedUrl={activeDragCamera.proxy_feed_url ?? activeDragCamera.proxyFeedUrl}
              playerUrl={activeDragCamera.playerUrl}
              offline={activeDragCamera.status === "offline"}
              className="size-8 shrink-0 rounded"
            />
            <span className="truncate text-xs font-medium">{activeDragCamera.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
