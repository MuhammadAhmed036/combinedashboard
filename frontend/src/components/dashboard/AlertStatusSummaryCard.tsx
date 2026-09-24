import { cn } from "@/lib/utils";

const STATUS_ROWS: { key: string; label: string; dotClass: string }[] = [
  { key: "active", label: "Active", dotClass: "bg-severity-high" },
  { key: "resolved", label: "Resolved", dotClass: "bg-status-active" },
  { key: "muted", label: "Muted", dotClass: "bg-muted-foreground" },
];

/**
 * Real active/resolved/muted breakdown of alert rules — distinct from the
 * top stat row's "Active Alert Rules" count (a single number) and from the
 * Alerts page's own status chart (a full-size page, not a dashboard-glance
 * card). Replaces the old "Active Alert Trend (24H)" widget, whose chart
 * and badge were both hardcoded mock data.
 */
export function AlertStatusSummaryCard({
  byStatus,
  total,
}: {
  byStatus: Record<string, number>;
  total: number;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-surface-border bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Alert Rules by Status</span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {total} Total
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2.5">
        {STATUS_ROWS.map((row) => {
          const count = byStatus[row.key] ?? 0;
          const percent = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={row.key} className="flex items-center gap-2 text-xs">
              <span className={cn("size-2 shrink-0 rounded-full", row.dotClass)} />
              <span className="w-14 shrink-0 text-muted-foreground">{row.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn("h-full rounded-full", row.dotClass)}
                  style={{ width: `${count > 0 ? Math.max(percent, 4) : 0}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right font-medium">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
