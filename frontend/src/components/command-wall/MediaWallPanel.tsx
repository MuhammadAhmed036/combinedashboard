"use client";

import { useMemo } from "react";
import { BellPlus, Radio, Users, Video, VideoOff } from "lucide-react";
import { CameraThumbnail } from "@/components/cameras/CameraThumbnail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { useUIStore } from "@/lib/store/useUIStore";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { cn } from "@/lib/utils";
import type { AlertRuleV2, Camera } from "@/lib/types";
import { CATEGORY_ACCENT, CATEGORY_LABEL, classAccent, classLabel } from "./alertVisuals";

type OccupancyEntry = {
  cameraId: string;
  cameraName?: string;
  peopleCount: number;
};

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

function findCameraRule(camera: Camera, rules: AlertRuleV2[]) {
  const keys = new Set(cameraKeys(camera));
  return rules.find((rule) => keys.has(rule.cameraId.toLowerCase()));
}

function CameraTile({
  camera,
  rule,
  livePeopleCount,
}: {
  camera: Camera | null;
  rule?: AlertRuleV2;
  livePeopleCount: number | null;
}) {
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);
  const unseen = rule ? effectiveUnseenCount(rule, baselines[rule.alertId] ?? 0) : 0;
  const primaryClass = rule?.classNames?.[0] ?? "person";
  const classColor = classAccent(primaryClass);
  const categoryColor = rule ? CATEGORY_ACCENT[rule.category] : "transparent";

  if (!camera) {
    return (
      <div className="relative min-h-0 overflow-hidden border border-surface-border bg-surface-2">
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Video className="size-5 opacity-50" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden border bg-black",
        rule ? "border-transparent" : "border-surface-border"
      )}
      style={{
        boxShadow: rule ? `inset 0 0 0 2px ${categoryColor}, inset 5px 0 0 ${classColor}` : undefined,
      }}
    >
      <CameraThumbnail
        seed={camera.thumbnailSeed}
        feedUrl={camera.proxy_feed_url ?? camera.proxyFeedUrl}
        playerUrl={camera.playerUrl}
        offline={camera.status === "offline"}
        className="size-full rounded-none"
      >
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold text-white",
              camera.status === "online" ? "bg-status-active/90" : "bg-destructive/90"
            )}
          >
            {camera.status === "online" ? <Radio className="size-3" /> : <VideoOff className="size-3" />}
            {camera.status === "online" ? "LIVE" : "OFF"}
          </span>
          {rule && (
            <span
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold text-black"
              style={{ backgroundColor: classColor }}
            >
              {classLabel(primaryClass)}
            </span>
          )}
        </div>

        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {camera.status === "online" && (
            <span className="inline-flex items-center gap-1 rounded-[4px] bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
              <Users className="size-3" />
              {livePeopleCount ?? "--"}
            </span>
          )}
          {rule && (
            <span
              className="rounded-bl-[8px] rounded-br-[3px] rounded-tl-[3px] rounded-tr-[8px] px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: categoryColor }}
            >
              {CATEGORY_LABEL[rule.category]}
            </span>
          )}
        </div>

        {rule && (
          <div className="absolute bottom-6 left-1.5 flex max-w-[calc(100%-12px)] flex-wrap gap-1">
            {rule.classNames.slice(0, 3).map((className) => (
              <span
                key={className}
                className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold text-black"
                style={{ backgroundColor: classAccent(className) }}
              >
                {classLabel(className)}
              </span>
            ))}
            {unseen > 0 && (
              <span className="rounded-[4px] bg-white px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                {unseen}
              </span>
            )}
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-[4px] bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {camera.name || camera.code}
        </div>
      </CameraThumbnail>
    </div>
  );
}

export function MediaWallPanel({
  cameras,
  rules,
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

  const wallCameras = useMemo(() => {
    if (!cameras) return [];
    return [...cameras].sort((a, b) => {
      if (a.status !== b.status) return a.status === "online" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [cameras]);

  function openCreateAlert() {
    setSelectedCameraId(null);
    setCreateAlertModalOpen(true);
  }

  return (
    <section className="relative flex min-h-0 flex-col bg-surface-1">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-surface-2 px-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Media Wall</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {cameras?.filter((camera) => camera.status === "online").length ?? 0}/{cameras?.length ?? 0} cameras
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1.5 rounded-[6px] px-2 text-xs" onClick={openCreateAlert}>
          <BellPlus className="size-3.5" />
          Create Alert
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3">
        {isLoading &&
          Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} className="h-full w-full rounded-none border border-surface-border" />
          ))}
        {!isLoading &&
          Array.from({ length: 9 }).map((_, index) => {
            const camera = wallCameras[index] ?? null;
            const rule = camera ? findCameraRule(camera, rules) : undefined;
            return (
              <CameraTile
                key={camera?.id ?? index}
                camera={camera}
                rule={rule}
                livePeopleCount={camera ? findLivePeopleCount(camera, liveOccupancy) : null}
              />
            );
          })}
      </div>
    </section>
  );
}
