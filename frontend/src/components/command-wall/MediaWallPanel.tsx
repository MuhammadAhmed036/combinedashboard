"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  BellPlus,
  SlidersHorizontal,
  Radio,
  VideoOff,
  Users,
  Video,
  X,
  Save,
  Download,
  RotateCcw,
  Check,
} from "lucide-react";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GridLayoutSwitch, gridDimensions } from "@/components/media-wall/GridLayoutSwitch";
import { CameraLibraryPanel } from "@/components/media-wall/CameraLibraryPanel";
import { useZones } from "@/lib/hooks/useZones";
import { useUIStore } from "@/lib/store/useUIStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { cn } from "@/lib/utils";
import type { AlertRuleV2, Camera, GridLayoutKey } from "@/lib/types";

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

function findLivePeopleCount(camera: Camera, liveOccupancy: Record<string, OccupancyEntry>) {
  const keys = new Set(cameraKeys(camera));
  for (const entry of Object.values(liveOccupancy)) {
    const entryKeys = [
      entry.cameraId,
      entry.cameraName,
      resolveDetectionCameraId(entry.cameraId),
      entry.cameraName ? resolveDetectionCameraId(entry.cameraName) : null,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    if (entryKeys.some((key) => keys.has(key))) return entry.peopleCount;
  }
  return null;
}

function DroppableMediaTile({
  index,
  camera,
  onClear,
  livePeopleCount,
  isCustomizing,
}: {
  index: number;
  camera: Camera | null;
  onClear: () => void;
  livePeopleCount: number | null;
  isCustomizing: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex size-full min-h-0 overflow-hidden rounded-[6px] transition-all duration-200 select-none",
        "bg-[#060a14] border border-cyan-500/25",
        isOver && "border-cyan-400 ring-2 ring-cyan-400/50 bg-cyan-950/30 scale-[0.99]",
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
        <div className="flex size-full flex-col items-center justify-center gap-1.5 p-2 text-center">
          <div className="flex size-7 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
            <Video className="size-3.5 opacity-70" />
          </div>
          <span className="font-mono text-[10px] font-semibold text-cyan-300/80">Slot #{index + 1}</span>
          <span className="text-[9px] text-muted-foreground">Drag camera here</span>
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
  rules: _rules,
  liveOccupancy,
  isLoading,
}: {
  cameras: Camera[] | undefined;
  rules: AlertRuleV2[];
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

  const { data: zones } = useZones();

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [activeDragCamera, setActiveDragCamera] = useState<Camera | null>(null);
  const [saveToast, setSaveToast] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const dims = gridDimensions(layout);
  const cellCount = dims * dims;

  const cameraById = useMemo(() => {
    return new Map(cameras?.map((c) => [c.id, c]) ?? []);
  }, [cameras]);

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
  }, [cameras]);

  // Save to JSON in LocalStorage whenever user explicitly clicks or updates
  const handleSaveConfig = () => {
    const configData = {
      layout,
      assignments,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configData));
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (e) {
      console.error("Failed to save config to localStorage:", e);
    }
  };

  const handleDownloadJSON = () => {
    const configData = {
      layout,
      assignments,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mediawall-layout-${layout}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleFavorite = (cameraId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(cameraId)) next.delete(cameraId);
      else next.add(cameraId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const cam = event.active.data.current?.camera as Camera | undefined;
    setActiveDragCamera(cam ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragCamera(null);
    const { active, over } = event;
    if (!over) return;
    const cameraId = String(active.id).replace("camera-", "");
    const cellIndex = Number(String(over.id).replace("cell-", ""));
    if (Number.isNaN(cellIndex)) return;
    assignCameraToCell(cellIndex, cameraId);
    // Auto-persist changes to JSON storage
    try {
      const current = assignments.filter((a) => a.cellIndex !== cellIndex);
      const next = [...current, { cellIndex, cameraId }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, assignments: next, savedAt: new Date().toISOString() }));
    } catch {}
  };

  const openCreateAlert = () => {
    setSelectedCameraId(null);
    setCreateAlertModalOpen(true);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <section className="relative flex min-h-0 flex-1 flex-col bg-surface-1 overflow-hidden">
        {/* Top Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface-2 px-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm font-semibold text-white">Media Wall</span>
            <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-400 border border-cyan-500/30">
              {layout}
            </span>
            <span className="truncate text-[11px] text-muted-foreground hidden sm:inline">
              {cameras?.filter((c) => c.status === "online").length ?? 0}/{cameras?.length ?? 0} cameras online
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Customize Wall button (toggles panel) */}
            <Button
              variant={isCustomizing ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-8 gap-1.5 rounded-[6px] px-2.5 text-xs font-medium transition-all",
                isCustomizing
                  ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                  : "border-surface-border hover:bg-surface-3"
              )}
              onClick={() => setIsCustomizing((prev) => !prev)}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{isCustomizing ? "Close Panel" : "Customize Wall"}</span>
            </Button>

            {/* Create Alert button */}
            <Button size="sm" className="h-8 gap-1.5 rounded-[6px] px-2.5 text-xs font-medium" onClick={openCreateAlert}>
              <BellPlus className="size-3.5" />
              <span>Create Alert</span>
            </Button>
          </div>
        </div>

        {/* Main Body: Grid + Optional Side Customizer Panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Media Wall Grid Area */}
          <div className="flex-1 p-2 min-h-0 overflow-hidden flex flex-col">
            <div
              className="grid flex-1 gap-1.5 min-h-0 w-full h-full"
              style={{
                gridTemplateColumns: `repeat(${dims}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${dims}, minmax(0, 1fr))`,
              }}
            >
              {isLoading &&
                Array.from({ length: cellCount }).map((_, i) => (
                  <Skeleton key={i} className="size-full rounded-[6px] border border-surface-border" />
                ))}

              {!isLoading &&
                Array.from({ length: cellCount }).map((_, index) => {
                  const assignment = assignments.find((a) => a.cellIndex === index);
                  const camera = assignment?.cameraId ? cameraById.get(assignment.cameraId) ?? null : null;
                  const livePeopleCount = camera ? findLivePeopleCount(camera, liveOccupancy) : null;

                  return (
                    <DroppableMediaTile
                      key={index}
                      index={index}
                      camera={camera}
                      onClear={() => {
                        assignCameraToCell(index, null);
                        try {
                          const next = assignments.filter((a) => a.cellIndex !== index);
                          localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, assignments: next, savedAt: new Date().toISOString() }));
                        } catch {}
                      }}
                      livePeopleCount={livePeopleCount}
                      isCustomizing={isCustomizing}
                    />
                  );
                })}
            </div>
          </div>

          {/* Slide-out Customization Panel */}
          {isCustomizing && (
            <aside className="w-80 shrink-0 border-l border-surface-border bg-surface-2 flex flex-col h-full min-h-0 animate-in slide-in-from-right duration-200">
              {/* Panel Header */}
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="size-4 text-cyan-400" />
                  <span className="text-xs font-semibold">Wall Layout & Library</span>
                </div>
                <button
                  onClick={() => setIsCustomizing(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Grid Selector & Persistence Actions */}
              <div className="p-3 border-b border-surface-border space-y-3 bg-surface-1/40">
                <div className="flex items-center justify-between">
                  <GridLayoutSwitch
                    value={layout}
                    onChange={(v: GridLayoutKey) => {
                      setLayout(v);
                      try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout: v, assignments, savedAt: new Date().toISOString() }));
                      } catch {}
                    }}
                    options={["1x1", "2x2", "3x3", "4x4", "5x5"]}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => {
                      clearMediaWallAssignments();
                      try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, assignments: [], savedAt: new Date().toISOString() }));
                      } catch {}
                    }}
                    title="Clear all cameras from grid"
                  >
                    <RotateCcw className="size-3" /> Reset
                  </Button>
                </div>

                {/* Save & Export JSON buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 h-7 text-[11px] gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
                    onClick={handleSaveConfig}
                  >
                    {saveToast ? <Check className="size-3.5 text-green-300" /> : <Save className="size-3.5" />}
                    <span>{saveToast ? "Saved to JSON!" : "Save Layout (JSON)"}</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] gap-1"
                    onClick={handleDownloadJSON}
                    title="Export layout as .json file"
                  >
                    <Download className="size-3" /> Export
                  </Button>
                </div>

                <div className="text-[10px] text-muted-foreground leading-tight">
                  Drag any camera onto a tile. Settings persist automatically across page refreshes.
                </div>
              </div>

              {/* Camera Library List */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {cameras && zones ? (
                  <CameraLibraryPanel
                    cameras={cameras}
                    zones={zones}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={toggleFavorite}
                    assignedCameraIds={assignedCameraIds}
                  />
                ) : (
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Drag Overlay for dragging camera thumbnail */}
        <DragOverlay>
          {activeDragCamera && (
            <div className="flex w-52 items-center gap-2 rounded-md border border-cyan-400 bg-surface-2 p-2 shadow-2xl z-[1000] pointer-events-none">
              <CameraThumbnail
                seed={activeDragCamera.thumbnailSeed}
                feedUrl={activeDragCamera.proxy_feed_url ?? activeDragCamera.proxyFeedUrl}
                playerUrl={activeDragCamera.playerUrl}
                offline={activeDragCamera.status === "offline"}
                className="size-8 shrink-0 rounded"
              />
              <span className="truncate text-xs font-semibold text-white">{activeDragCamera.name}</span>
            </div>
          )}
        </DragOverlay>
      </section>
    </DndContext>
  );
}
