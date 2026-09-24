import type { AlertCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<AlertCategory, string> = {
  critical: "bg-severity-critical/15 text-severity-critical border-severity-critical/30",
  medium: "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
  low: "bg-severity-low/15 text-severity-low border-severity-low/30",
};

const LABEL: Record<AlertCategory, string> = {
  critical: "High",
  medium: "Medium",
  low: "Low",
};

export function AlertCategoryBadge({
  category,
  className,
}: {
  category: AlertCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[category],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {LABEL[category]}
    </span>
  );
}
