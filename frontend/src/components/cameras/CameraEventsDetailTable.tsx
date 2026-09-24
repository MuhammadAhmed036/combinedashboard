"use client";

import { Fragment, useState } from "react";
import type { CameraEventDetail } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function StatusDot({ status }: { status: string | null }) {
  const color =
    status === "available" ? "bg-status-active" : status === "deleted" ? "bg-destructive" : "bg-muted-foreground";
  return <span className={cn("size-1.5 rounded-full", color)} />;
}

/** Collapses a detection list into one entry per class with its count. */
function classSummary(detections: { className: string }[]): { className: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of detections) counts.set(d.className, (counts.get(d.className) ?? 0) + 1);
  return [...counts.entries()].map(([className, count]) => ({ className, count }));
}

export function CameraEventsDetailTable({
  events,
  isLoading,
}: {
  events: CameraEventDetail[] | undefined;
  isLoading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No detection events recorded yet for this camera.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-surface-border bg-surface-2 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Detections</th>
            <th className="px-3 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">Inference</th>
            <th className="px-3 py-2 font-medium">Total</th>
            <th className="px-3 py-2 font-medium">Image</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {events.map((event) => {
            const expanded = expandedId === event.eventId;
            return (
              <Fragment key={event.eventId}>
                <tr
                  onClick={() => setExpandedId(expanded ? null : event.eventId)}
                  className="cursor-pointer transition-colors hover:bg-surface-2"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {event.detectionTs ? formatDateTime(event.detectionTs) : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {event.detectionCount} ({event.detections.map((d) => d.className).join(", ") || "none"})
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {event.modelName ?? "—"} · {event.device ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {event.inferenceMs !== null ? `${event.inferenceMs.toFixed(1)} ms` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {event.totalMs !== null ? `${event.totalMs.toFixed(1)} ms` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusDot status={event.rawImageStatus} />
                      {event.rawImageStatus ?? "unknown"}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr key={`${event.eventId}-detail`}>
                    <td colSpan={6} className="bg-surface-1 px-3 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        {event.imageExists ? (
                          <DetectionFrameImage
                            eventId={event.eventId}
                            alt={`Detection frame ${event.eventId}`}
                            className="h-40 w-64 shrink-0 rounded-md border border-surface-border bg-black object-contain"
                          />
                        ) : (
                          <div className="flex h-40 w-64 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface-3 text-xs text-muted-foreground">
                            No snapshot available
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="mb-1.5 font-medium text-foreground">Detected classes</div>
                          {event.detections.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {classSummary(event.detections).map((c) => (
                                <span
                                  key={c.className}
                                  className="rounded-full border border-surface-border bg-surface-2 px-2 py-0.5 text-muted-foreground"
                                >
                                  {c.className}
                                  {c.count > 1 ? ` ×${c.count}` : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No objects detected</span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
