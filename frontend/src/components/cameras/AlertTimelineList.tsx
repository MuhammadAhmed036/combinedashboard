import Link from "next/link";
import type { Alert } from "@/lib/types";
import { SeverityBadge } from "@/components/alerts/SeverityBadge";
import { formatTime } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";

export function AlertTimelineList({
  alerts,
  isLoading,
}: {
  alerts: Alert[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!alerts || alerts.length === 0) {
    return <p className="text-sm text-muted-foreground">No alerts recorded for this camera.</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.slice(0, 6).map((alert) => (
        <div key={alert.id} className="flex items-start justify-between gap-2 rounded-lg border border-surface-border bg-surface-2 p-2.5">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{formatTime(alert.timestamp)}</div>
            <div className="truncate text-sm font-medium">{alert.title}</div>
          </div>
          <SeverityBadge severity={alert.severity} className="shrink-0" />
        </div>
      ))}
      <Link href="/alerts" className="block pt-1 text-xs text-primary hover:underline">
        View All Alerts &rsaquo;
      </Link>
    </div>
  );
}
