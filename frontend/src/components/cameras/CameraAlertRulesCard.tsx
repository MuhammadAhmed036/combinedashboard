"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useAlertRules } from "@/lib/hooks/useAlertRules";
import { AlertRuleStatusBadge } from "@/components/alerts/AlertRuleStatusBadge";
import { AlertCategoryBadge } from "@/components/alerts/AlertCategoryBadge";
import { AbsenceLiveStatus } from "@/components/alerts/AbsenceLiveStatus";
import { isAbsenceRule } from "@/lib/alertConditions";
import { Skeleton } from "@/components/ui/skeleton";

export function CameraAlertRulesCard({ cameraId }: { cameraId: string }) {
  const { data: rules, isLoading } = useAlertRules({ cameraId });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Bell className="size-4" /> Alert Rules ({rules?.length ?? 0})
      </h3>
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {!isLoading && (!rules || rules.length === 0) && (
        <p className="text-xs text-muted-foreground">No alert rules configured for this camera yet.</p>
      )}
      {rules && rules.length > 0 && (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <Link
              key={rule.alertId}
              href="/alerts"
              className="block rounded-md border border-surface-border bg-surface-1 px-2.5 py-1.5 text-xs hover:bg-surface-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{rule.name ?? rule.alertId}</span>
                <span className="shrink-0 text-muted-foreground">{rule.eventCount} matches</span>
                <AlertCategoryBadge category={rule.category} className="shrink-0" />
                <AlertRuleStatusBadge status={rule.status} className="shrink-0" />
              </div>
              {isAbsenceRule(rule) && <AbsenceLiveStatus rule={rule} className="mt-1" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
