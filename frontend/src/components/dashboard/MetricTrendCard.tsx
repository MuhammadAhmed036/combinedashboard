import { cn } from "@/lib/utils";
import { MiniTrendChart } from "@/components/dashboard/MiniTrendChart";
import type { TrendPoint } from "@/lib/types";

export function MetricTrendCard({
  label,
  badge,
  badgeTone = "default",
  value,
  valueSuffix,
  subLabel,
  chartData,
  chartColor,
  chartVariant = "area",
}: {
  label: string;
  badge?: string;
  badgeTone?: "default" | "critical" | "high" | "positive" | "negative";
  value: string | number;
  valueSuffix?: string;
  subLabel?: string;
  /** Omit entirely (rather than fabricate a trend) when there's no real time-series data to back it. */
  chartData?: TrendPoint[];
  chartColor?: string;
  chartVariant?: "line" | "area";
}) {
  const toneClass: Record<string, string> = {
    default: "bg-surface-3 text-muted-foreground",
    critical: "bg-severity-critical/15 text-severity-critical",
    high: "bg-severity-high/15 text-severity-high",
    positive: "bg-status-active/15 text-status-active",
    negative: "bg-destructive/15 text-destructive",
  };

  return (
    <div className="flex flex-col rounded-xl border border-surface-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {badge && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", toneClass[badgeTone])}>
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold">{value}</span>
        {valueSuffix && <span className="text-xs text-muted-foreground">{valueSuffix}</span>}
      </div>
      {subLabel && <div className="mt-0.5 text-xs text-muted-foreground">{subLabel}</div>}
      {chartData && chartColor && (
        <div className="mt-2 -ml-1">
          <MiniTrendChart data={chartData} color={chartColor} variant={chartVariant} height={56} />
        </div>
      )}
    </div>
  );
}
