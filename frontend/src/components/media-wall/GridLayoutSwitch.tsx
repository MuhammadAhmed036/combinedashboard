"use client";

import type { GridLayoutKey } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PRESET_OPTIONS: { key: GridLayoutKey; label: string; count: number }[] = [
  { key: "1x1", label: "1x1", count: 1 },
  { key: "2x2", label: "2x2", count: 4 },
  { key: "3x3", label: "3x3", count: 9 },
  { key: "4x4", label: "4x4", count: 16 },
  { key: "5x5", label: "5x5", count: 25 },
  { key: "6x6", label: "6x6", count: 36 },
  { key: "8x8", label: "8x8", count: 64 },
  { key: "10x10", label: "10x10", count: 100 },
];

export function gridDimensions(key: GridLayoutKey): number {
  const d = Number(key.split("x")[0]);
  return isNaN(d) ? 4 : d;
}

export function GridLayoutSwitch({
  value,
  onChange,
}: {
  value: GridLayoutKey;
  onChange: (key: GridLayoutKey) => void;
  options?: GridLayoutKey[];
}) {
  const currentDim = gridDimensions(value);

  return (
    <div className="flex flex-col gap-2.5 w-full">
      {/* Quick Preset Buttons (4x2 grid matrix) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
            Presets
          </span>
          <span className="text-[9px] font-mono text-slate-300">
            {currentDim * currentDim} slots active
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {PRESET_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={cn(
                "rounded-[4px] py-1 text-[11px] font-mono font-medium transition-all text-center cursor-pointer",
                value === key
                  ? "bg-[#c01823] text-white font-bold shadow-xs"
                  : "bg-surface-3 text-muted-foreground hover:bg-surface-border hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Custom Slider up to 10x10 (100 cameras) */}
      <div className="rounded-lg bg-black/50 border border-white/10 p-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
            Custom Grid
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-[#252a36] px-2 py-0.5 font-mono text-[11px] font-bold text-slate-200 border border-slate-700 shadow-sm">
            {currentDim}x{currentDim}
            <span className="text-white/60 text-[10px]">({currentDim * currentDim} cams)</span>
          </span>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[9px] font-mono text-muted-foreground shrink-0">1x1</span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={currentDim}
            onChange={(e) => {
              const d = e.target.value;
              onChange(`${d}x${d}` as GridLayoutKey);
            }}
            className="w-full accent-cyan-400 h-1.5 bg-surface-3 rounded cursor-pointer"
          />
          <span className="text-[9px] font-mono text-muted-foreground shrink-0">10x10</span>
        </div>
      </div>
    </div>
  );
}
