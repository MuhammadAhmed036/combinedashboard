import type { AlertStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<AlertStatus, string> = {
  active: "bg-status-active/15 text-status-active border-status-active/30",
  acknowledged: "bg-status-acknowledged/15 text-status-acknowledged border-status-acknowledged/30",
  investigating: "bg-status-investigating/15 text-status-investigating border-status-investigating/30",
  resolved: "bg-status-resolved/15 text-status-resolved border-status-resolved/30",
  closed: "bg-status-closed/15 text-status-closed border-status-closed/30",
};

const LABEL: Record<AlertStatus, string> = {
  active: "Active",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

export function StatusBadge({ status, className }: { status: AlertStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}
