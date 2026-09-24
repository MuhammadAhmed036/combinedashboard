"use client";

import { Grid2x2, Grid3x3, LayoutGrid } from "lucide-react";
import type { GridLayoutKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPTIONS: { key: GridLayoutKey; label: string; icon: typeof Grid2x2 }[] = [
  { key: "1x1", label: "1x1", icon: LayoutGrid },
  { key: "2x2", label: "2x2", icon: Grid2x2 },
  { key: "3x3", label: "3x3", icon: Grid3x3 },
  { key: "4x4", label: "4x4", icon: Grid3x3 },
  { key: "5x5", label: "5x5", icon: Grid3x3 },
];

export function gridDimensions(key: GridLayoutKey): number {
  return Number(key.split("x")[0]);
}

export function GridLayoutSwitch({
  value,
  onChange,
  options = OPTIONS.map((o) => o.key),
}: {
  value: GridLayoutKey;
  onChange: (key: GridLayoutKey) => void;
  options?: GridLayoutKey[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-surface-border bg-surface-2 p-1">
      <span className="px-1.5 text-xs text-muted-foreground">Grid:</span>
      {OPTIONS.filter((o) => options.includes(o.key)).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-3"
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
