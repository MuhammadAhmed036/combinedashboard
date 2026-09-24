import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  trend,
  trendLabel,
  href,
  hrefLabel,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  href?: string;
  hrefLabel?: string;
}) {
  const isPositive = (trend ?? 0) >= 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-2 p-4">
      <div
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary",
          iconClassName
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
        {trend !== undefined ? (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1 text-xs font-medium",
              isPositive ? "text-status-active" : "text-destructive"
            )}
          >
            {isPositive ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {Math.abs(trend)}% {trendLabel}
          </div>
        ) : href ? (
          <Link href={href} className="mt-0.5 inline-block text-xs text-primary hover:underline">
            {hrefLabel ?? "View all"} &rsaquo;
          </Link>
        ) : null}
      </div>
    </div>
  );
}
