"use client";

import { HardDrive } from "lucide-react";
import { useCameraRetention } from "@/lib/hooks/useCameraDetail";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber } from "@/lib/formatters";

export function CameraRetentionCard({ cameraId }: { cameraId: string }) {
  const { data: retention, isLoading } = useCameraRetention(cameraId);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <HardDrive className="size-4" /> Storage & Retention
      </h3>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {!isLoading && !retention && (
        <p className="text-xs text-muted-foreground">No retention data available for this camera.</p>
      )}
      {retention && (
        <dl className="space-y-3 text-xs">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Total Events</dt>
            <dd className="font-medium">{formatNumber(retention.totalEvents)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Raw Images Retained</dt>
            <dd className="font-medium">
              {retention.retainedRaw} / {retention.target}
            </dd>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${retention.target > 0 ? Math.min(100, (retention.retainedRaw / retention.target) * 100) : 0}%`,
              }}
            />
          </div>
          {retention.remainingToTarget > 0 ? (
            <p className="text-[11px] text-severity-medium">
              {retention.remainingToTarget} more needed to reach target
            </p>
          ) : (
            <p className="text-[11px] text-status-active">Target reached</p>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Events With Raw Image</dt>
            <dd className="font-medium">{formatNumber(retention.withRaw)}</dd>
          </div>
          {retention.latestTs && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Latest Event</dt>
              <dd className="font-medium">{formatDateTime(retention.latestTs)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
