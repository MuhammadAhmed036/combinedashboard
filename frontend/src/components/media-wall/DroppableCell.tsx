"use client";

import { useDroppable } from "@dnd-kit/core";
import { Users, X, Maximize2, AlertTriangle } from "lucide-react";
import type { Camera } from "@/lib/types";
import type { ActiveCameraAlert } from "@/lib/cameraAlertsLookup";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { cn } from "@/lib/utils";

export function DroppableCell({
  index,
  camera,
  onClear,
  onMaximize,
  hasAlert,
  activeAlert,
  livePeopleCount,
}: {
  index: number;
  camera: Camera | null;
  onClear: () => void;
  onMaximize?: (camera: Camera) => void;
  hasAlert?: boolean;
  activeAlert?: ActiveCameraAlert | null;
  /** Live person count from the detection API's people-count feed; `null`/`undefined` while no live reading has arrived yet. */
  livePeopleCount?: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      onDoubleClick={() => camera && onMaximize?.(camera)}
      className={cn(
        "group relative flex h-full min-h-[90px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-surface-border bg-surface-2 transition-colors",
        isOver && "border-primary bg-primary/10",
        camera && cn(
          "border-solid ring-1 ring-surface-border cursor-pointer",
          activeAlert
            ? activeAlert.category === "critical"
              ? "border-red-500 ring-2 ring-red-500/50 shadow-[0_0_14px_rgba(239,68,68,0.35)]"
              : activeAlert.category === "medium"
              ? "border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_14px_rgba(245,158,11,0.35)]"
              : "border-blue-400 ring-2 ring-blue-400/50 shadow-[0_0_14px_rgba(59,130,246,0.35)]"
            : hasAlert && "ring-2 ring-destructive"
        )
      )}
    >
      {!camera && (
        <>
          <span className="absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded bg-black/50 text-[10px] font-medium text-white">
            {index + 1}
          </span>
          <span className="px-2 text-center text-xs text-muted-foreground">
            Drag a camera here
          </span>
        </>
      )}
      {camera && (
        <CameraThumbnail
          seed={camera.thumbnailSeed}
          feedUrl={camera.proxy_feed_url ?? camera.proxyFeedUrl}
          playerUrl={camera.playerUrl}
          offline={camera.status === "offline"}
          className="h-full w-full"
        >
          <div className="absolute left-2 top-2 flex items-center gap-1.5">
            {camera.status === "online" && (
              <span className="rounded-md bg-status-active/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                LIVE
              </span>
            )}
            {hasAlert && (
              <span className="rounded-md bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                ALERT
              </span>
            )}
          </div>
          <div className="absolute right-2 top-2 flex items-center gap-1.5 z-10">
            {/* Small 1-second blinking circle dot (Red for Critical/High, Yellow for Medium, Blue for Low) */}
            {activeAlert && camera.status === "online" && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize?.(camera);
                }}
                className="relative flex size-3 items-center justify-center cursor-pointer select-none"
                title={`Active Alert: ${activeAlert.ruleName || "Security Alert"} (${activeAlert.category.toUpperCase()})`}
              >
                {/* Outer pinging ripple (1s duration) */}
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full opacity-75 animate-ping",
                    activeAlert.category === "critical"
                      ? "bg-red-500"
                      : activeAlert.category === "medium"
                      ? "bg-amber-400"
                      : "bg-blue-400"
                  )}
                  style={{ animationDuration: "1s" }}
                />
                {/* Inner solid glowing circle dot (1s pulse) */}
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full shadow-sm animate-pulse",
                    activeAlert.category === "critical"
                      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] ring-1 ring-red-300"
                      : activeAlert.category === "medium"
                      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] ring-1 ring-amber-200"
                      : "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)] ring-1 ring-blue-200"
                  )}
                  style={{ animationDuration: "1s" }}
                />
              </div>
            )}

            {camera.status === "online" && (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white transition-colors",
                  livePeopleCount !== null && livePeopleCount !== undefined && livePeopleCount >= 5
                    ? "bg-destructive shadow-md animate-pulse"
                    : "bg-black/55 text-white"
                )}
              >
                <Users className="size-3" /> {livePeopleCount ?? "—"}
              </div>
            )}
            {onMaximize && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize(camera);
                }}
                className="flex size-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-cyan-500 hover:text-black group-hover:opacity-100 cursor-pointer"
                title="Expand Camera Full Focus (1080p)"
                aria-label="Maximize camera"
              >
                <Maximize2 className="size-3.5" />
              </button>
            )}
            <button
              onClick={onClear}
              className="flex size-6 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
              aria-label="Remove camera"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="absolute bottom-2 left-2 right-2 truncate text-[11px] font-medium text-white/90">
            {camera.code} · {camera.zoneName}
          </div>
        </CameraThumbnail>
      )}
    </div>
  );
}
