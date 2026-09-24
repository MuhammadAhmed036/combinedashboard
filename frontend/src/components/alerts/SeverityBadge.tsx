import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { AlertSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SEVERITY_LABEL } from "@/lib/mock/alert-types";

const STYLES: Record<AlertSeverity, string> = {
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  high: "bg-severity-high/15 text-severity-high border-severity-high/30",
  medium: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  low: "bg-severity-low/15 text-severity-low border-severity-low/30",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: AlertSeverity;
  className?: string;
}) {
  const Icon = severity === "critical" ? ShieldAlert : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[severity],
        className
      )}
    >
      <Icon className="size-3" />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
