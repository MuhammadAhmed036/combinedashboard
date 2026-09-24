"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Camera as CameraIcon, Maximize2, Pause, Play } from "lucide-react";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { CameraEventsDetailTable } from "@/components/cameras/CameraEventsDetailTable";
import { CameraRegistryDetails } from "@/components/cameras/CameraRegistryDetails";
import { CameraLiveStatsPanel } from "@/components/cameras/CameraLiveStatsPanel";
import { CameraAlertRulesCard } from "@/components/cameras/CameraAlertRulesCard";
import { CameraRetentionCard } from "@/components/cameras/CameraRetentionCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCamera } from "@/lib/hooks/useCameras";
import { useCameraLocation } from "@/lib/hooks/useCameraLocations";
import { useCameraEvents } from "@/lib/hooks/useCameraDetail";
import { useUIStore } from "@/lib/store/useUIStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";

export default function CameraDetailPage() {
  const params = useParams<{ id: string }>();
  const cameraId = params.id;
  const { data: camera, isLoading, error: cameraError, mutate } = useCamera(cameraId);
  const registryCameraId = resolveDetectionCameraId(camera?.sourceName ?? cameraId);
  const { data: registryCamera } = useCameraLocation(registryCameraId);
  const { data: events, isLoading: eventsLoading } = useCameraEvents(registryCameraId, 25);
  const setSelectedCameraId = useUIStore((s) => s.setSelectedCameraId);
  const setCreateAlertModalOpen = useUIStore((s) => s.setCreateAlertModalOpen);

  const [playing, setPlaying] = useState(true);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[420px] w-full rounded-xl" />
      </div>
    );
  }

  if (cameraError || !camera) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Link
          href="/cameras"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to Cameras
        </Link>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-16 text-center">
          <p className="text-sm font-medium text-destructive">
            {cameraError ? "Camera API is unavailable" : "Camera was not found"}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/cameras" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to Cameras
      </Link>

      <div className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{registryCamera?.cameraName ?? camera.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                camera.status === "online"
                  ? "bg-status-active/15 text-status-active"
                  : "bg-status-resolved/15 text-status-resolved"
              }`}
            >
              {camera.status === "online" ? "Online" : "Offline"}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            @{camera.code} · {registryCamera?.zone ?? camera.location}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90"
            onClick={() => {
              setSelectedCameraId(registryCameraId);
              setCreateAlertModalOpen(true);
            }}
          >
            <Bell className="size-4" /> Create Alert
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <CameraThumbnail
            seed={camera.thumbnailSeed}
            feedUrl={camera.proxy_feed_url ?? camera.proxyFeedUrl}
            playerUrl={camera.playerUrl}
            offline={camera.status === "offline"}
            playing={playing}
            interactive
            className="aspect-video w-full rounded-xl"
          >
            {camera.status === "online" && playing && (
              <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" /> LIVE
              </span>
            )}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between rounded-lg bg-black/45 px-3 py-2 backdrop-blur">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="flex size-7 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
                >
                  {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
                <span className="text-xs text-white/80">{camera.code}</span>
              </div>
              <div className="flex items-center gap-2 text-white/80">
                <CameraIcon className="size-4" />
                <Maximize2 className="size-4" />
              </div>
            </div>
          </CameraThumbnail>

          <CameraLiveStatsPanel cameraId={registryCameraId} />

          <div className="rounded-xl border border-surface-border bg-surface-2 p-4">
            <h3 className="mb-3 text-sm font-medium">Detection Events</h3>
            <CameraEventsDetailTable events={events} isLoading={eventsLoading} />
          </div>
        </div>

        <div className="space-y-4">
          {registryCamera && <CameraRegistryDetails camera={registryCamera} />}
          <CameraAlertRulesCard cameraId={registryCameraId} />
          <CameraRetentionCard cameraId={registryCameraId} />
        </div>
      </div>
    </div>
  );
}
