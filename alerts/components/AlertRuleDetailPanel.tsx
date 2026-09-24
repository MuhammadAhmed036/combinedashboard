"use client";

import Link from "next/link";
import { Camera as CameraIcon, Check, Clock, MapPin, Trash2, VolumeX } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertRuleStatusBadge } from "@/components/alerts/AlertRuleStatusBadge";
import { AlertCategoryBadge } from "@/components/alerts/AlertCategoryBadge";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { AbsenceLiveStatus } from "@/components/alerts/AbsenceLiveStatus";
import { AbsenceDailyTotal } from "@/components/alerts/AbsenceDailyTotal";
import { AbsenceEventHistory } from "@/components/alerts/AbsenceEventHistory";
import {
  useAlertHistory,
  useAlertRule,
  useDeleteAlertRule,
  useMarkAlertSeen,
  useUpdateAlertRuleStatus,
} from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import {
  absenceThresholdSeconds,
  describeAlertCondition,
  describeMatchCounts,
  formatAbsenceThreshold,
  isAbsenceRule,
} from "@/lib/alertConditions";
import { formatDateTime } from "@/lib/formatters";

export function AlertRuleDetailPanel({
  alertId,
  open,
  onOpenChange,
}: {
  alertId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: rule, isLoading } = useAlertRule(alertId);
  const { data: history } = useAlertHistory(alertId);
  const markSeen = useMarkAlertSeen();
  const updateStatus = useUpdateAlertRuleStatus();
  const deleteRule = useDeleteAlertRule();
  const baseline = useAlertSeenBaselineStore((s) => (alertId ? (s.baselines[alertId] ?? 0) : 0));
  const unseen = rule ? effectiveUnseenCount(rule, baseline) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-md">
        {isLoading || !rule ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="flex h-full flex-col overflow-y-auto">
            <SheetHeader className="border-b border-surface-border pb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {describeAlertCondition(rule)}
                </span>
                <div className="flex items-center gap-1.5">
                  <AlertCategoryBadge category={rule.category} />
                  <AlertRuleStatusBadge status={rule.status} />
                </div>
              </div>
              <SheetTitle>{rule.name ?? rule.alertId}</SheetTitle>
              {rule.description && (
                <p className="text-xs text-muted-foreground">{rule.description}</p>
              )}
              {isAbsenceRule(rule) && <AbsenceLiveStatus rule={rule} className="mt-1" />}
            </SheetHeader>

            <div className="space-y-4 p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-surface-border bg-black">
                {rule.latestEventId ? (
                  <>
                    <DetectionFrameImage
                      key={rule.latestEventId}
                      eventId={rule.latestEventId}
                      alt="Latest matched frame"
                      className="h-full w-full object-contain"
                    />
                    {rule.boundingBox && rule.refImageWidth && rule.refImageHeight && (
                      <div
                        className="pointer-events-none absolute border-2 border-primary bg-primary/15"
                        style={{
                          left: `${(rule.boundingBox.x1 / rule.refImageWidth) * 100}%`,
                          top: `${(rule.boundingBox.y1 / rule.refImageHeight) * 100}%`,
                          width: `${((rule.boundingBox.x2 - rule.boundingBox.x1) / rule.refImageWidth) * 100}%`,
                          height: `${((rule.boundingBox.y2 - rule.boundingBox.y1) / rule.refImageHeight) * 100}%`,
                        }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    No matched detection yet
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-surface-border bg-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <CameraIcon className="size-3.5" /> Camera
                  </span>
                  <span className="font-medium">{rule.cameraId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="size-3.5" /> Zone
                  </span>
                  <span className="font-medium">{rule.zone ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-3.5" /> Updated
                  </span>
                  <span className="font-medium">
                    {rule.updatedAt ? formatDateTime(rule.updatedAt) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Matched Events</span>
                  <span className="font-medium">{rule.eventCount}</span>
                </div>
                {isAbsenceRule(rule) && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">No-person threshold</span>
                    <span className="font-medium">
                      {formatAbsenceThreshold(absenceThresholdSeconds(rule))}
                    </span>
                  </div>
                )}
                {isAbsenceRule(rule) && <AbsenceDailyTotal rule={rule} />}
              </div>

              {isAbsenceRule(rule) && <AbsenceEventHistory rule={rule} />}

              <div>
                <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Match History ({history?.length ?? 0})
                </h4>
                <div className="space-y-2">
                  {history?.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No matches recorded yet for this rule.
                    </p>
                  )}
                  {history?.map((match) => (
                    <div
                      key={`${match.eventId}-${match.createdAt}`}
                      className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface-2 p-2"
                    >
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-black">
                        <DetectionFrameImage
                          eventId={match.eventId}
                          alt="Matched frame"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-medium">
                          {match.detectionTs || match.createdAt
                            ? formatDateTime((match.detectionTs ?? match.createdAt) as string)
                            : "—"}
                        </div>
                        <div className="text-muted-foreground">
                          {isAbsenceRule(rule)
                            ? (match.note ?? "No person detected")
                            : describeMatchCounts(match)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto space-y-2 border-t border-surface-border p-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={unseen === 0 || markSeen.isPending}
                  onClick={() => markSeen.mutate({ alertId: rule.alertId })}
                  className="gap-1.5"
                >
                  <Check className="size-4" /> Mark Seen
                </Button>
                <Button
                  variant="outline"
                  disabled={rule.status === "muted" || updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "muted" })}
                  className="gap-1.5"
                >
                  <VolumeX className="size-4" /> Mute
                </Button>
              </div>
              <Button
                disabled={rule.status === "resolved" || updateStatus.isPending}
                onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "resolved" })}
                className="w-full gap-1.5"
              >
                <Check className="size-4" /> Resolve
              </Button>
              <Button variant="secondary" className="w-full" asChild>
                <Link href={`/cameras/${rule.cameraId}`}>View Camera</Link>
              </Button>
              <Button
                variant="destructive"
                className="w-full gap-1.5"
                disabled={deleteRule.isPending}
                onClick={() => {
                  deleteRule.mutate(rule.alertId);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="size-4" /> Delete Rule
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
