"use client";

import { X } from "lucide-react";
import type { CameraLocation } from "@/lib/types";
import { useCameraLiveFeed } from "@/lib/hooks/useCameraLiveFeed";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { zoneColor } from "@/components/map/CameraLocationMap";
import { cn } from "@/lib/utils";

function formatDetectionTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function CameraLiveInfoPanel({
  camera,
  onClose,
}: {
  camera: CameraLocation;
  onClose: () => void;
}) {
  const feed = useCameraLiveFeed(camera.cameraId);
  const displayName = feed.cameraName ?? camera.cameraName;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="relative aspect-video w-full shrink-0 bg-black">
        {feed.latestEventId ? (
          <DetectionFrameImage
            key={feed.latestEventId}
            eventId={feed.latestEventId}
            alt={`${displayName} — latest frame`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Waiting for live frame…
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
          <span
            className={cn(
              "size-1.5 rounded-full",
              feed.connected ? "animate-pulse bg-red-500" : "bg-gray-400"
            )}
          />
          {feed.connected ? "Live" : "Connecting…"}
        </div>
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/70"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: zoneColor(feed.zone ?? camera.zone) }}
            />
            <h3 className="font-semibold leading-tight">{displayName}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(feed.zone ?? camera.zone) || "No zone"}
            {(feed.scene ?? camera.scene) ? ` · ${feed.scene ?? camera.scene}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-surface-border bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">People Count</div>
            <div className="mt-1 text-xl font-semibold">{feed.peopleCount ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-surface-border bg-surface-2 p-3">
            <div className="text-xs text-muted-foreground">Last Detection</div>
            <div className="mt-1 text-xl font-semibold">
              {formatDetectionTime(feed.lastDetectionTime)}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Camera ID</span>
            <span className="font-mono text-foreground">{camera.cameraId}</span>
          </div>
          {camera.cameraIp && (
            <div className="flex justify-between">
              <span>IP</span>
              <span className="font-mono text-foreground">{camera.cameraIp}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Latest Event ID</span>
            <span className="truncate font-mono text-foreground">{feed.latestEventId ?? "—"}</span>
          </div>
        </div>

        {feed.error && <p className="text-xs text-destructive">{feed.error}</p>}
      </div>
    </div>
  );
}
