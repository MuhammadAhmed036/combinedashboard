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
import { RotateCcw, X, Maximize2, Minimize2, Scan } from "lucide-react";
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
import { useAllAlertEvents } from "@/lib/hooks/useAlertRules";
import { buildCameraAlertLookup, findCameraActiveAlert } from "@/lib/cameraAlertsLookup";
import { useUIStore } from "@/lib/store/useUIStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { cn } from "@/lib/utils";
import type { Camera, GridLayoutKey } from "@/lib/types";

const SAFE_CONCURRENT_DECODERS = 16;

export default function MediaWallPage() {
  const { data: cameras } = useCameras();
  const { data: zones } = useZones();
  const liveOccupancy = useLiveCameraOccupancy();
  const { data: allAlertEvents } = useAllAlertEvents();

  const cameraAlertLookup = useMemo(() => {
    return buildCameraAlertLookup(allAlertEvents);
  }, [allAlertEvents]);

  const layout = useUIStore((s) => s.mediaWallLayout);
  const setLayout = useUIStore((s) => s.setMediaWallLayout);
  const assignments = useUIStore((s) => s.mediaWallAssignments);
  const assignCameraToCell = useUIStore((s) => s.assignCameraToCell);
  const clearMediaWallAssignments = useUIStore((s) => s.clearMediaWallAssignments);

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [activeDragCamera, setActiveDragCamera] = useState<Camera | null>(null);
  const [enlargedCamera, setEnlargedCamera] = useState<Camera | null>(null);
  const [isModalFullscreen, setIsModalFullscreen] = useState<boolean>(false);
  const [modalFit, setModalFit] = useState<"contain" | "cover">("contain");
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!enlargedCamera) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isModalFullscreen) {
          setIsModalFullscreen(false);
        } else {
          setEnlargedCamera(null);
        }
      } else if (e.key === "f" || e.key === "F") {
        setIsModalFullscreen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enlargedCamera, isModalFullscreen]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dims = gridDimensions(layout);
  const cellCount = dims * dims;

  const cameraById = useMemo(() => {
    const map = new Map(cameras?.map((c) => [c.id, c]));
    return map;
  }, [cameras]);

  const assignmentByCell = useMemo(() => {
    return new Map(assignments.map((assignment) => [assignment.cellIndex, assignment.cameraId]));
  }, [assignments]);

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

  const activeSlots = useMemo(() => {
    const pool = new Set<number>();
    const activeCameraIds = new Set<string>();

    if (activeSlotIndex !== null && activeSlotIndex >= 0 && activeSlotIndex < cellCount) {
      pool.add(activeSlotIndex);
      const cameraId = assignmentByCell.get(activeSlotIndex);
      if (cameraId) activeCameraIds.add(cameraId);
    }

    for (let i = 0; i < cellCount; i++) {
      const cameraId = assignmentByCell.get(i);
      if (cameraId && activeCameraIds.has(cameraId)) {
        pool.add(i);
      }
    }

    for (let i = 0; i < cellCount; i++) {
      if (activeCameraIds.size >= SAFE_CONCURRENT_DECODERS) break;
      const cameraId = assignmentByCell.get(i);
      if (!cameraId) continue;
      activeCameraIds.add(cameraId);
      pool.add(i);
    }

    return pool;
  }, [activeSlotIndex, assignmentByCell, cellCount]);

  const guardActive = cellCount > SAFE_CONCURRENT_DECODERS;

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
              {guardActive && (
                <span
                  className="hidden rounded-md border border-emerald-600/60 bg-emerald-950/70 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 sm:inline-flex"
                  title={`Production guard keeps only ${SAFE_CONCURRENT_DECODERS} live camera decoders active; other tiles stay in standby until hovered or opened.`}
                >
                  Guard: {activeSlots.size}/{cellCount} live
                </span>
              )}
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
                const assignedCameraId = assignmentByCell.get(i);
                const camera = assignedCameraId ? cameraById.get(assignedCameraId) ?? null : null;
                const livePeopleCount = camera
                  ? (livePeopleCountByName.get(camera.id.toLowerCase()) ??
                     livePeopleCountByName.get(camera.name.toLowerCase()) ??
                     livePeopleCountByName.get(camera.code.toLowerCase()) ??
                     livePeopleCountByName.get(resolveDetectionCameraId(camera.code ?? camera.id).toLowerCase()) ??
                     livePeopleCountByName.get(resolveDetectionCameraId(camera.name ?? camera.id).toLowerCase()) ??
                     null)
                  : null;
                const isHighOccupancy = livePeopleCount !== null && livePeopleCount !== undefined && livePeopleCount >= 5;
                const activeAlert = camera ? findCameraActiveAlert(camera, cameraAlertLookup) : null;
                const isStandby = guardActive && !activeSlots.has(i);
                return (
                  <div key={i} className="min-h-[90px]">
                    <DroppableCell
                      index={i}
                      camera={camera}
                      onClear={() => assignCameraToCell(i, null)}
                      onMaximize={(cam) => setEnlargedCamera(cam)}
                      hasAlert={isHighOccupancy}
                      activeAlert={activeAlert}
                      livePeopleCount={livePeopleCount}
                      isStandby={isStandby}
                      onActivate={() => setActiveSlotIndex(i)}
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

      {/* ── Focused 1080p Single Camera Focus Modal (VMS Full View) ── */}
      {enlargedCamera && (
        <div
          className={cn(
            "fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-200",
            isModalFullscreen ? "p-0" : "p-2 sm:p-4 lg:p-6"
          )}
          onClick={() => {
            setIsModalFullscreen(false);
            setEnlargedCamera(null);
          }}
        >
          <div
            className={cn(
              "relative flex flex-col bg-[#12141a] overflow-hidden transition-all duration-200",
              isModalFullscreen
                ? "w-screen h-screen rounded-none border-none shadow-none"
                : "w-full max-w-[96vw] xl:max-w-[1680px] h-[92vh] max-h-[96vh] rounded-xl border border-[#2d3342] shadow-2xl"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Top Bar */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#2d3342] bg-[#1a1d26] px-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-bold text-sm text-white truncate">{enlargedCamera.name || enlargedCamera.code}</span>
                {enlargedCamera.zoneName && (
                  <span className="text-xs font-mono text-slate-300 truncate">({enlargedCamera.zoneName})</span>
                )}
                <span className="hidden sm:inline-flex rounded bg-[#252a36] px-2 py-0.5 text-[10px] font-mono text-slate-200 border border-slate-700 shrink-0">
                  1080p Full Focus
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Aspect Fit / Cover Toggle */}
                <button
                  type="button"
                  onClick={() => setModalFit((f) => (f === "contain" ? "cover" : "contain"))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-[#252a36] hover:bg-[#2e3444] border border-slate-700 text-slate-200 transition-colors cursor-pointer"
                  title="Toggle between Full Aspect Fit (100% Uncropped Feed) and Fill View"
                >
                  <Scan className="size-3.5" />
                  <span className="hidden sm:inline">{modalFit === "contain" ? "Fit: Full Frame" : "Fill: Cropped"}</span>
                </button>

                {/* Fullscreen Button */}
                <button
                  type="button"
                  onClick={() => setIsModalFullscreen((f) => !f)}
                  className="flex size-8 items-center justify-center rounded-lg bg-white/10 hover:bg-slate-700 text-white transition-colors cursor-pointer"
                  title={isModalFullscreen ? "Exit Fullscreen (Esc / F)" : "Fullscreen (F)"}
                  aria-label={isModalFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isModalFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsModalFullscreen(false);
                    setEnlargedCamera(null);
                  }}
                  className="flex size-8 items-center justify-center rounded-lg bg-white/10 hover:bg-destructive hover:text-white text-white transition-colors cursor-pointer"
                  title="Close (Esc)"
                  aria-label="Close modal"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Modal Video Player */}
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
              <CameraThumbnail
                seed={enlargedCamera.thumbnailSeed}
                feedUrl={enlargedCamera.proxy_feed_url ?? enlargedCamera.proxyFeedUrl}
                playerUrl={enlargedCamera.playerUrl}
                offline={enlargedCamera.status === "offline"}
                interactive={true}
                objectFit={modalFit}
                className="size-full"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex h-9 shrink-0 items-center justify-between border-t border-[#2d3342] bg-[#1a1d26] px-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-3 truncate">
                <span>Source: <strong className="text-slate-200">{enlargedCamera.sourceName || enlargedCamera.name}</strong></span>
                <span className="hidden md:inline text-slate-600">•</span>
                <span className="hidden md:inline">
                  Feed: <span className="text-slate-200">{modalFit === "contain" ? "Full Uncropped Feed" : "Cover Zoom"}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden lg:inline text-slate-500">
                  Press <kbd className="rounded bg-slate-800 px-1 text-slate-300">F</kbd> for Fullscreen, <kbd className="rounded bg-slate-800 px-1 text-slate-300">Esc</kbd> to return
                </span>
                <span className="text-slate-400">Click Close or outside to return to Media Wall</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
