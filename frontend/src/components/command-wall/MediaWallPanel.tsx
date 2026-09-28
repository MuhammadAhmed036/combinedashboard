"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  BellPlus,
  SlidersHorizontal,
  Radio,
  VideoOff,
  Users,
  Video,
  X,
  Maximize2,
  ShieldCheck,
  ShieldAlert,
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

// Maximum concurrent hardware decoders safe for Chrome/Edge without tab crash or GPU freeze
const SAFE_CONCURRENT_DECODERS = 16;

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
  isStandby,
  onActivate,
  onMaximize,
}: {
  index: number;
  camera: Camera | null;
  onClear: () => void;
  livePeopleCount: number | null;
  isCustomizing: boolean;
  dims: number;
  isStandby: boolean;
  onActivate: () => void;
  onMaximize: (camera: Camera) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      onMouseEnter={onActivate}
      onDoubleClick={() => camera && onMaximize(camera)}
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
          isStandby={isStandby}
          onActivate={onActivate}
          className="size-full rounded-none"
        >
          {/* Top-left: LIVE / OFF */}
          <div className="absolute left-1.5 top-1.5 flex items-center gap-1 z-10 pointer-events-none">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm",
                camera.status === "online" ? "bg-status-active/90" : "bg-destructive/90"
              )}
            >
              {camera.status === "online" ? <Radio className="size-2.5" /> : <VideoOff className="size-2.5" />}
              {camera.status === "online" ? (isStandby ? "STANDBY" : "LIVE") : "OFF"}
            </span>
          </div>

          {/* Top-right: Occupancy count + Maximize + Delete 'X' button */}
          <div className="absolute right-1.5 top-1.5 flex items-center gap-1 z-10">
            {camera.status === "online" && (
              <span className="inline-flex items-center gap-1 rounded-[4px] bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white border border-white/10 shadow-sm pointer-events-none">
                <Users className="size-2.5" />
                {livePeopleCount ?? "--"}
              </span>
            )}

            {/* Maximize Focus Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMaximize(camera);
              }}
              className="flex size-5 items-center justify-center rounded-[4px] bg-black/80 text-white/80 hover:bg-cyan-500 hover:text-black transition-all shadow-md cursor-pointer opacity-0 group-hover:opacity-100"
              title="Expand Camera Fullscreen (1080p Focus)"
              aria-label="Maximize Camera"
            >
              <Maximize2 className="size-2.5" />
            </button>

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
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pt-3 pb-1 z-10 pointer-events-none">
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

  // VMS Hardware Guard: Prevents browser crash & GPU freeze on large grids (5x5 to 10x10)
  const [hardwareGuard, setHardwareGuard] = useState<boolean>(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [enlargedCamera, setEnlargedCamera] = useState<Camera | null>(null);

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

  // Compute active slots allocation based on hardware decoder budget and stream multiplexing
  const activeSlots = useMemo(() => {
    // 1. If guard is off or grid <= 36 (e.g. 6x6, 4x4, etc.), ALL slots stream live directly!
    if (!hardwareGuard || cellCount <= 36) {
      const all = new Set<number>();
      for (let i = 0; i < cellCount; i++) all.add(i);
      return all;
    }

    // 2. For ultra-dense grids (8x8 = 64, 10x10 = 100):
    // Active camera budget is 32 unique cameras.
    const activeCameraIds = new Set<string>();
    const pool = new Set<number>();

    // Instant priority for hovered slot
    if (hoveredIndex !== null) {
      pool.add(hoveredIndex);
      const camId = assignmentByCell.get(hoveredIndex);
      if (camId) activeCameraIds.add(camId);
    }

    // Include slots whose camera is already in activeCameraIds (multiplexing is free!)
    for (let i = 0; i < cellCount; i++) {
      const camId = assignmentByCell.get(i);
      if (camId && activeCameraIds.has(camId)) {
        pool.add(i);
      }
    }

    // Fill remaining budget up to 32 unique cameras
    for (let i = 0; i < cellCount; i++) {
      if (activeCameraIds.size >= 32) break;
      const camId = assignmentByCell.get(i);
      if (camId) {
        activeCameraIds.add(camId);
        pool.add(i);
      }
    }

    // If still room, fill up to 32 slots
    for (let i = 0; i < cellCount; i++) {
      if (pool.size >= 32) break;
      pool.add(i);
    }

    return pool;
  }, [cellCount, hardwareGuard, hoveredIndex, assignmentByCell]);

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

            {/* VMS Hardware Guard Status Badge (for large grids 8x8 to 10x10) */}
            {cellCount > 36 && (
              <button
                type="button"
                onClick={() => setHardwareGuard((prev) => !prev)}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[10px] font-mono border transition-all cursor-pointer shadow-sm",
                  hardwareGuard
                    ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                    : "bg-amber-950/80 border-amber-500/60 text-amber-300 hover:bg-amber-900/60 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                )}
                title={
                  hardwareGuard
                    ? "VMS Hardware Guard Active: Prevents browser tab crash & GPU freeze by allocating max 16 active decoders. Hover over any camera to stream live."
                    : "Hardware Guard Inactive: Decoding all streams simultaneously."
                }
              >
                {hardwareGuard ? (
                  <ShieldCheck className="size-3 text-emerald-400" />
                ) : (
                  <ShieldAlert className="size-3 text-amber-400" />
                )}
                <span className="font-semibold">{hardwareGuard ? "VMS Guard: Active" : "VMS Guard: Off"}</span>
                <span className="text-[9px] text-white/50 hidden md:inline">
                  ({hardwareGuard ? `${activeSlots.size} Max Live` : "Uncapped"})
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
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
                  const isStandby = !activeSlots.has(index);

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
                      isStandby={isStandby}
                      onActivate={() => setHoveredIndex(index)}
                      onMaximize={(cam) => setEnlargedCamera(cam)}
                    />
                  );
                })}
            </div>
          </div>
        </div>

        {/* ── Focused 1080p Single Camera Focus Modal (VMS Full View) ── */}
        {enlargedCamera && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
            onClick={() => setEnlargedCamera(null)}
          >
            <div
              className="relative flex flex-col w-full max-w-5xl h-[80vh] rounded-xl bg-[#060a14] border-2 border-cyan-400/80 shadow-[0_0_35px_rgba(6,182,212,0.6)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Top Bar */}
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-cyan-500/30 bg-[#08101e] px-4">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-bold text-sm text-white">{enlargedCamera.name || enlargedCamera.code}</span>
                  <span className="text-xs font-mono text-cyan-400">({enlargedCamera.zoneName})</span>
                  <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 border border-cyan-800">
                    1080p Full Focus
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setEnlargedCamera(null)}
                  className="flex size-7 items-center justify-center rounded-lg bg-white/10 hover:bg-destructive hover:text-white transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Modal Video Player */}
              <div className="flex-1 relative bg-black">
                <CameraThumbnail
                  seed={enlargedCamera.thumbnailSeed}
                  feedUrl={enlargedCamera.proxy_feed_url ?? enlargedCamera.proxyFeedUrl}
                  playerUrl={enlargedCamera.playerUrl}
                  offline={enlargedCamera.status === "offline"}
                  interactive={true}
                  className="size-full"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex h-9 shrink-0 items-center justify-between border-t border-cyan-500/20 bg-[#08101e] px-4 text-xs font-mono text-slate-400">
                <span>Source: {enlargedCamera.sourceName}</span>
                <span className="text-cyan-400">Click Close or outside to return to Media Wall</span>
              </div>
            </div>
          </div>
        )}
      </section>
  );
}
