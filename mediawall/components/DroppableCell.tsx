"use client";

import { useDroppable } from "@dnd-kit/core";
import { Users, X } from "lucide-react";
import type { Camera } from "@/lib/types";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { cn } from "@/lib/utils";

export function DroppableCell({
  index,
  camera,
  onClear,
  hasAlert,
  livePeopleCount,
}: {
  index: number;
  camera: Camera | null;
  onClear: () => void;
  hasAlert?: boolean;
  /** Live person count from the detection API's people-count feed; `null`/`undefined` while no live reading has arrived yet. */
  livePeopleCount?: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${index}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex h-full min-h-[90px] items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-surface-border bg-surface-2 transition-colors",
        isOver && "border-primary bg-primary/10",
        camera && cn("border-solid ring-1 ring-surface-border", hasAlert && "ring-2 ring-destructive")
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
          <div className="absolute right-2 top-2 flex items-center gap-1.5">
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
