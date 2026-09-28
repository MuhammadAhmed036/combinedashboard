"use client";

import { useEffect, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  BellPlus,
  SlidersHorizontal,
  Radio,
  VideoOff,
  Users,
  Video,
  X,
} from "lucide-react";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { gridDimensions } from "@/components/media-wall/GridLayoutSwitch";
import { useUIStore } from "@/lib/store/useUIStore";
import { useCustomizeWallStore } from "@/lib/store/useCustomizeWallStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { cn } from "@/lib/utils";
import type { Camera, GridLayoutKey } from "@/lib/types";

type OccupancyEntry = {
  cameraId: string;
  cameraName?: string;
  peopleCount: number;
};

const STORAGE_KEY = "safecity_mediawall_custom_config";

function cameraKeys(camera: Camera) {
  return [
    camera.id,
    camera.code,
    camera.name,
    camera.sourceName,
    resolveDetectionCameraId(camera.id),
    resolveDetectionCameraId(camera.code ?? camera.id),
    resolveDetectionCameraId(camera.name ?? camera.id),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

function createOccupancyLookup(liveOccupancy: Record<string, OccupancyEntry>) {
  const lookup = new Map<string, number>();
  for (const entry of Object.values(liveOccupancy)) {
    const entryKeys = [
      entry.cameraId,
      entry.cameraName,
      resolveDetectionCameraId(entry.cameraId),
      entry.cameraName ? resolveDetectionCameraId(entry.cameraName) : null,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    entryKeys.forEach((key) => lookup.set(key, entry.peopleCount));
  }
  return lookup;
}

function findLivePeopleCount(camera: Camera, occupancyLookup: Map<string, number>) {
  for (const key of cameraKeys(camera)) {
    const count = occupancyLookup.get(key);
    if (count !== undefined) return count;
  }
  return null;
}

function DroppableMediaTile({
  index,
  camera,
  onClear,
  livePeopleCount,
  isCustomizing,
  dims,
}: {
  index: number;
  camera: Camera | null;
  onClear: () => void;
  livePeopleCount: number | null;
  isCustomizing: boolean;
  dims: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex size-full overflow-hidden rounded-[6px] transition-all duration-200 select-none",
        dims <= 3 ? "min-h-0" : "aspect-video min-h-[85px]",
        "bg-[#060a14] border border-cyan-500/25",
        isOver && "border-cyan-300 ring-2 ring-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.8)] bg-cyan-950/60 scale-[0.99] z-20",
        camera && "hover:border-cyan-400/60 hover:shadow-[0_0_12px_rgba(6,182,212,0.18)]",
        !camera && "border-dashed border-cyan-500/20 bg-cyan-950/10 hover:border-cyan-400/40"
      )}
    >
      {/* Tactical Corner Accents */}
      <div className="pointer-events-none absolute left-0 top-0 size-2 border-l-2 border-t-2 border-cyan-400/80 z-20" />
      <div className="pointer-events-none absolute right-0 top-0 size-2 border-r-2 border-t-2 border-cyan-400/80 z-20" />
      <div className="pointer-events-none absolute bottom-0 left-0 size-2 border-b-2 border-l-2 border-cyan-400/80 z-20" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-2 border-b-2 border-r-2 border-cyan-400/80 z-20" />

      {!camera ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center pointer-events-none">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              isOver ? "bg-cyan-400 text-black shadow-[0_0_15px_rgba(6,182,212,1)]" : "bg-cyan-500/10 text-cyan-400"
            )}
          >
            <Video className="size-3.5" />
          </div>
          <span className="font-mono text-[10px] font-semibold text-cyan-300/80">Slot #{index + 1}</span>
          <span className={cn("text-[9px]", isOver ? "font-semibold text-cyan-300" : "text-muted-foreground")}>
            {isOver ? "Release to assign" : "Drag camera here"}
          </span>
        </div>
      ) : (
        <CameraThumbnail
          seed={camera.thumbnailSeed}
          feedUrl={camera.proxy_feed_url ?? camera.proxyFeedUrl}
          playerUrl={camera.playerUrl}
          offline={camera.status === "offline"}
          className="size-full rounded-none"
        >
          {/* Top-left: LIVE / OFF */}
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 z-10">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm",
                camera.status === "online" ? "bg-status-active/90" : "bg-destructive/90"
              )}
            >
              {camera.status === "online" ? <Radio className="size-2.5" /> : <VideoOff className="size-2.5" />}
              {camera.status === "online" ? "LIVE" : "OFF"}
            </span>
          </div>

          {/* Top-right: Occupancy count + Delete 'X' button */}
          <div className="absolute right-1.5 top-1.5 flex items-center gap-1 z-10">
            {camera.status === "online" && (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white border border-white/10 shadow-sm">
                <Users className="size-2.5" />
                {livePeopleCount ?? "--"}
              </span>
            )}
            {/* Delete 'X' button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className={cn(
                "flex size-5 items-center justify-center rounded-[4px] bg-black/80 text-white/80 hover:bg-destructive hover:text-white transition-all shadow-md cursor-pointer",
                isCustomizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              title="Remove camera from this slot"
              aria-label="Remove camera"
            >
              <X className="size-3" />
            </button>
          </div>

          {/* Bottom Bar: Camera name and zone */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pt-3 pb-1 z-10">
            <div className="truncate text-[10px] font-semibold text-white tracking-wide">
              {camera.name || camera.code}
            </div>
          </div>
        </CameraThumbnail>
      )}
    </div>
  );
}

export function MediaWallPanel({
  cameras,
  liveOccupancy,
  isLoading,
}: {
  cameras: Camera[] | undefined;
  liveOccupancy: Record<string, OccupancyEntry>;
  isLoading: boolean;
}) {
  const setSelectedCameraId = useUIStore((s) => s.setSelectedCameraId);
  const setCreateAlertModalOpen = useUIStore((s) => s.setCreateAlertModalOpen);

  const layout = useUIStore((s) => s.mediaWallLayout);
  const setLayout = useUIStore((s) => s.setMediaWallLayout);
  const assignments = useUIStore((s) => s.mediaWallAssignments);
  const assignCameraToCell = useUIStore((s) => s.assignCameraToCell);
  const clearMediaWallAssignments = useUIStore((s) => s.clearMediaWallAssignments);
  const isCustomizingWall = useCustomizeWallStore((s) => s.isCustomizingWall);
  const toggleCustomizingWall = useCustomizeWallStore((s) => s.toggleCustomizingWall);


  const dims = gridDimensions(layout);
  const cellCount = dims * dims;

  const cameraById = useMemo(() => {
    return new Map(cameras?.map((c) => [c.id, c]) ?? []);
  }, [cameras]);

  const assignmentByCell = useMemo(() => {
    return new Map(assignments.map((assignment) => [assignment.cellIndex, assignment.cameraId]));
  }, [assignments]);

  const occupancyLookup = useMemo(() => createOccupancyLookup(liveOccupancy), [liveOccupancy]);

  const onlineCameraCount = useMemo(
    () => cameras?.filter((camera) => camera.status === "online").length ?? 0,
    [cameras]
  );

  const assignedCameraIds = useMemo(
    () => new Set(assignments.map((a) => a.cameraId).filter(Boolean) as string[]),
    [assignments]
  );

  // Load custom configuration from JSON storage on mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed.layout) setLayout(parsed.layout);
        if (Array.isArray(parsed.assignments) && parsed.assignments.length > 0) {
          parsed.assignments.forEach((a: { cellIndex: number; cameraId: string | null }) => {
            assignCameraToCell(a.cellIndex, a.cameraId);
          });
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load saved media wall config:", e);
    }

    // Default initialization if no assignments exist
    if (!cameras?.length || assignments.length > 0) return;
    const working = cameras.filter((c) => c.status === "online");
    const autoCams = working.length > 0 ? working : cameras;
    const autoLayout: GridLayoutKey =
      autoCams.length > 16 ? "5x5" : autoCams.length > 9 ? "4x4" : autoCams.length > 4 ? "3x3" : "2x2";
    setLayout(autoLayout);
    const count = gridDimensions(autoLayout) ** 2;
    autoCams.slice(0, count).forEach((cam, i) => assignCameraToCell(i, cam.id));
  }, [assignCameraToCell, assignments.length, cameras, setLayout]);

  const handleSaveConfig = () => {
    // Config persisted via localStorage
  };

  const openCreateAlert = () => {
    setSelectedCameraId(null);
    setCreateAlertModalOpen(true);
  };

  return (
    <section className="relative flex min-h-0 flex-1 flex-col bg-surface-1 overflow-hidden">
        {/* Top Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface-2 px-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-semibold text-white">Media Wall</span>
            <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              {layout}
            </span>
            <span className="truncate text-[11px] text-muted-foreground hidden sm:inline">
              {onlineCameraCount}/{cameras?.length ?? 0} cameras online
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Customize Wall button (toggles panel) */}
            <Button
              variant={isCustomizingWall ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-all",
                isCustomizingWall
                  ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)] font-semibold"
                  : "border-surface-border hover:bg-surface-3"
              )}
              onClick={toggleCustomizingWall}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{isCustomizingWall ? "Close Customize" : "Customize Wall"}</span>
            </Button>

            {/* Create Alert button */}
            <Button size="sm" className="h-8 gap-1.5 rounded-[6px] px-2.5 text-xs font-medium" onClick={openCreateAlert}>
              <BellPlus className="size-3.5" />
              <span>Create Alert</span>
            </Button>
          </div>
        </div>

        {/* Main Body: Grid Area (with middle vertical scroll support up to 100 cameras) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 p-2 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col">
            <div
              className={cn("grid gap-1.5 w-full", dims <= 3 ? "flex-1 min-h-0 h-full" : "auto-rows-fr")}
              style={{
                gridTemplateColumns: `repeat(${dims}, minmax(0, 1fr))`,
                ...(dims <= 3 ? { gridTemplateRows: `repeat(${dims}, minmax(0, 1fr))` } : {}),
              }}
            >
              {isLoading &&
                Array.from({ length: cellCount }).map((_, i) => (
                  <Skeleton key={i} className="size-full rounded-[6px] border border-surface-border" />
                ))}

              {!isLoading &&
                Array.from({ length: cellCount }).map((_, index) => {
                  const assignedCameraId = assignmentByCell.get(index);
                  const camera = assignedCameraId ? cameraById.get(assignedCameraId) ?? null : null;
                  const livePeopleCount = camera ? findLivePeopleCount(camera, occupancyLookup) : null;

                  return (
                    <DroppableMediaTile
                      key={index}
                      index={index}
                      dims={dims}
                      camera={camera}
                      onClear={() => {
                        assignCameraToCell(index, null);
                        try {
                          const next = assignments.filter((a) => a.cellIndex !== index);
                          localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, assignments: next, savedAt: new Date().toISOString() }));
                        } catch {}
                      }}
                      livePeopleCount={livePeopleCount}
                      isCustomizing={isCustomizingWall}
                    />
                  );
                })}
            </div>
          </div>
        </div>

      </section>
  );
}
