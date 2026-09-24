"use client";

import { MoreVertical } from "lucide-react";
import type { AlertRuleV2 } from "@/lib/types";
import { describeAlertCondition, isAbsenceRule } from "@/lib/alertConditions";
import { AbsenceLiveStatus } from "@/components/alerts/AbsenceLiveStatus";
import { AlertRuleStatusBadge } from "@/components/alerts/AlertRuleStatusBadge";
import { AlertCategoryBadge } from "@/components/alerts/AlertCategoryBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDeleteAlertRule,
  useMarkAlertSeen,
  useUpdateAlertRuleStatus,
} from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function AlertRulesTable({
  rules,
  isLoading,
  onSelectRule,
  onViewCamera,
}: {
  rules: AlertRuleV2[];
  isLoading: boolean;
  onSelectRule: (alertId: string) => void;
  onViewCamera: (cameraId: string) => void;
}) {
  const markSeen = useMarkAlertSeen();
  const updateStatus = useUpdateAlertRuleStatus();
  const deleteRule = useDeleteAlertRule();
  const baselines = useAlertSeenBaselineStore((s) => s.baselines);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-2 py-16 text-center text-sm text-muted-foreground">
        No alert rules match your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-surface-border bg-surface-2 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Rule</th>
            <th className="px-3 py-3 font-medium">Category</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Camera</th>
            <th className="px-3 py-3 font-medium">Zone</th>
            <th className="px-3 py-3 font-medium">Matches</th>
            <th className="px-3 py-3 font-medium">Updated</th>
            <th className="px-3 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {rules.map((rule) => {
            const unseen = effectiveUnseenCount(rule, baselines[rule.alertId] ?? 0);
            return (
            <tr
              key={rule.alertId}
              onClick={() => onSelectRule(rule.alertId)}
              className="cursor-pointer transition-colors hover:bg-surface-2"
            >
              <td className="max-w-[260px] px-4 py-3">
                <div className="truncate font-medium">{rule.name ?? rule.alertId}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {describeAlertCondition(rule)}
                </div>
                {isAbsenceRule(rule) && <AbsenceLiveStatus rule={rule} className="mt-0.5" />}
              </td>
              <td className="px-3 py-3">
                <AlertCategoryBadge category={rule.category} />
              </td>
              <td className="px-3 py-3">
                <AlertRuleStatusBadge status={rule.status} />
              </td>
              <td className="px-3 py-3 font-medium">{rule.cameraId}</td>
              <td className="px-3 py-3 text-muted-foreground">{rule.zone ?? "—"}</td>
              <td className="px-3 py-3">
                <span className="font-medium">{rule.eventCount}</span>
                {unseen > 0 && (
                  <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                    {unseen} new
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                {rule.updatedAt ? formatDateTime(rule.updatedAt) : "—"}
              </td>
              <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn("rounded-md p-1.5 hover:bg-surface-3")} aria-label="Rule actions">
                      <MoreVertical className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onSelectRule(rule.alertId)}>
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewCamera(rule.cameraId)}>
                      View Camera
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={unseen === 0 || markSeen.isPending}
                      onClick={() => markSeen.mutate({ alertId: rule.alertId })}
                    >
                      Mark Seen
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={rule.status === "muted" || updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "muted" })}
                    >
                      Mute
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={rule.status === "resolved" || updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ alertId: rule.alertId, status: "resolved" })}
                    >
                      Resolve
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={deleteRule.isPending}
                      onClick={() => deleteRule.mutate(rule.alertId)}
                      className="text-destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
