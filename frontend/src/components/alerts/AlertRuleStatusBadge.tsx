import type { AlertRuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  resolved: "bg-status-resolved/15 text-status-resolved border-status-resolved/30",
  muted: "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30",
};

export function AlertRuleStatusBadge({
  status,
  className,
}: {
  status: AlertRuleStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        STYLES[status] ?? STYLES.muted,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
