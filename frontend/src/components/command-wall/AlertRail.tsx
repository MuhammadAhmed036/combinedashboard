"use client";

import { useMemo } from "react";
import { Check, CircleAlert, Eye, Radio, X } from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { Skeleton } from "@/components/ui/skeleton";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { describeAlertCondition } from "@/lib/alertConditions";
import { formatTime } from "@/lib/formatters";
import { useMarkAlertSeen, useUpdateAlertRuleStatus } from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import type { AlertRuleV2 } from "@/lib/types";
import { CATEGORY_ACCENT, CATEGORY_LABEL, classAccent, classLabel } from "./alertVisuals";

function AlertItem({ rule }: { rule: AlertRuleV2 }) {
  const markSeen = useMarkAlertSeen();
  const updateStatus = useUpdateAlertRuleStatus();
  const baseline = useAlertSeenBaselineStore((s) => s.baselines[rule.alertId] ?? 0);
  const unseen = effectiveUnseenCount(rule, baseline);
  const primaryClass = rule.classNames[0] ?? "person";
  const categoryColor = CATEGORY_ACCENT[rule.category];
  const classColor = classAccent(primaryClass);

  return (
    <article
      className="relative overflow-hidden border-b border-surface-border bg-surface-2"
      style={{ boxShadow: `inset 4px 0 0 ${classColor}` }}
    >
      <div
        className="absolute right-0 top-0 rounded-bl-[10px] px-2 py-1 text-[10px] font-bold text-white"
        style={{ backgroundColor: categoryColor }}
      >
        {CATEGORY_LABEL[rule.category]}
      </div>

      <div className="flex gap-2 p-2 pr-12">
        <div className="h-14 w-16 shrink-0 overflow-hidden rounded-[6px] bg-black">
          {rule.latestEventId ? (
            <DetectionFrameImage
              eventId={rule.latestEventId}
              alt="Latest matched frame"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <CircleAlert className="size-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold text-black"
              style={{ backgroundColor: classColor }}
            >
              {classLabel(primaryClass)}
            </span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-normal text-status-active">
              {rule.status}
            </span>
          </div>
          <div className="mt-1 truncate text-xs font-semibold">{rule.name ?? rule.alertId}</div>
          <div className="truncate text-[11px] text-muted-foreground">{rule.cameraId}</div>
          <div className="truncate text-[11px] text-muted-foreground">{describeAlertCondition(rule)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 px-2 pb-2">
        <div className="flex min-w-0 flex-wrap gap-1">
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
            <span className="rounded-[4px] bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unseen} new
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {rule.updatedAt && (
            <span className="hidden text-[10px] text-muted-foreground 2xl:inline">
              {formatTime(rule.updatedAt)}
            </span>
          )}
          {unseen > 0 && (
            <button
              type="button"
              title="Mark seen"
              aria-label="Mark seen"
              disabled={markSeen.isPending}
              onClick={() => markSeen.mutate({ alertId: rule.alertId })}
              className="flex size-6 items-center justify-center rounded-[5px] border border-surface-border hover:bg-surface-3 disabled:opacity-50"
            >
              <Eye className="size-3.5" />
            </button>
          )}
          {rule.status !== "resolved" && (
            <button
              type="button"
              title="Resolve"
              aria-label="Resolve"
              disabled={updateStatus.isPending}
              onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "resolved" })}
              className="flex size-6 items-center justify-center rounded-[5px] border border-surface-border hover:bg-surface-3 disabled:opacity-50"
            >
              <Check className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function AlertRail({
  rules,
  isLoading,
  error,
}: {
  rules: AlertRuleV2[] | undefined;
  isLoading: boolean;
  error?: Error | null;
}) {
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);
  const items = useMemo(() => {
    return [...(rules ?? [])]
      .filter((rule) => rule.status !== "resolved")
      .sort((a, b) => {
        const unseenDelta =
          effectiveUnseenCount(b, baselines[b.alertId] ?? 0) -
          effectiveUnseenCount(a, baselines[a.alertId] ?? 0);
        if (unseenDelta !== 0) return unseenDelta;
        return (
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
        );
      })
      .slice(0, 20);
  }, [rules, baselines]);

  return (
    <aside className="flex min-h-0 flex-col border-l border-surface-border bg-surface-2">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">Alerts</div>
          <div className="truncate text-[11px] text-muted-foreground">{items.length} active</div>
        </div>
        <span className="inline-flex size-7 items-center justify-center rounded-[6px] bg-destructive/15 text-destructive">
          <Radio className="size-3.5" />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading &&
          Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-none border-b border-surface-border" />
          ))}
        {!isLoading && (error || items.length === 0) && (
          <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
            <div>
              <X className="mx-auto mb-2 size-5" />
              {error ? "Alert API offline" : "No active alerts"}
            </div>
          </div>
        )}
        {!isLoading && !error && items.map((rule) => <AlertItem key={rule.alertId} rule={rule} />)}
      </div>
    </aside>
  );
}


