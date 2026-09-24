"use client";

import { Eye } from "lucide-react";
import type { AlertRuleV2 } from "@/lib/types";
import { AlertRuleStatusBadge } from "@/components/alerts/AlertRuleStatusBadge";
import { AlertCategoryBadge } from "@/components/alerts/AlertCategoryBadge";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { AbsenceLiveStatus } from "@/components/alerts/AbsenceLiveStatus";
import { AbsenceDailyTotal } from "@/components/alerts/AbsenceDailyTotal";
import { describeAlertCondition, isAbsenceRule } from "@/lib/alertConditions";
import { Button } from "@/components/ui/button";
import { useMarkAlertSeen, useUpdateAlertRuleStatus } from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { formatTime } from "@/lib/formatters";

export function AlertRuleFeedCard({
  rule,
  onViewCamera,
}: {
  rule: AlertRuleV2;
  onViewCamera: (cameraId: string) => void;
}) {
  const markSeen = useMarkAlertSeen();
  const updateStatus = useUpdateAlertRuleStatus();
  const baseline = useAlertSeenBaselineStore((s) => s.baselines[rule.alertId] ?? 0);
  const unseen = effectiveUnseenCount(rule, baseline);

  return (
    <div className="rounded-lg border border-surface-border bg-surface-2 p-3">
      <div className="flex gap-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-black">
          {rule.latestEventId ? (
            <DetectionFrameImage
              key={rule.latestEventId}
              eventId={rule.latestEventId}
              alt="Latest matched frame"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No match yet
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <AlertCategoryBadge category={rule.category} />
              <AlertRuleStatusBadge status={rule.status} />
            </div>
            {rule.updatedAt && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatTime(rule.updatedAt)}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{rule.name ?? rule.alertId}</div>
          <div className="truncate text-xs text-muted-foreground">
            {rule.cameraId} &middot; {rule.zone ?? "no zone"}
          </div>
          <div className="truncate text-xs text-muted-foreground">{describeAlertCondition(rule)}</div>
          {isAbsenceRule(rule) && <AbsenceLiveStatus rule={rule} className="mt-0.5" />}
          {isAbsenceRule(rule) && <AbsenceDailyTotal rule={rule} className="mt-0.5 text-[11px]" />}
          {unseen > 0 && (
            <div className="mt-0.5 text-[11px] font-medium text-destructive">
              {unseen} new match{unseen === 1 ? "" : "es"}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 flex-1 gap-1 px-2 text-xs"
          onClick={() => onViewCamera(rule.cameraId)}
        >
          <Eye className="size-3.5" /> View Camera
        </Button>
        {unseen > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={markSeen.isPending}
            onClick={() => markSeen.mutate({ alertId: rule.alertId })}
          >
            Mark Seen
          </Button>
        )}
        {rule.status !== "resolved" && (
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "resolved" })}
          >
            Resolve
          </Button>
        )}
      </div>
    </div>
  );
}
