"use client";

import { Crosshair, Expand, Layers, Minus, Plus, Satellite, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";

function ControlButton({
  onClick,
  children,
  active,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-9 items-center justify-center rounded-md border border-surface-border bg-surface-2/95 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-surface-3",
        active && "border-primary text-primary"
      )}
    >
      {children}
    </button>
  );
}

export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onLocate,
  onFullscreen,
  onToggleHeat,
  heatActive,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
  onFullscreen: () => void;
  onToggleHeat: () => void;
  heatActive: boolean;
}) {
  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
      <div className="flex flex-col overflow-hidden rounded-md border border-surface-border bg-surface-2/95 shadow-sm backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="Zoom in"
          className="flex size-9 items-center justify-center border-b border-surface-border hover:bg-surface-3"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="Zoom out"
          className="flex size-9 items-center justify-center hover:bg-surface-3"
        >
          <Minus className="size-4" />
        </button>
      </div>
      <ControlButton onClick={onLocate} label="Recenter">
        <Crosshair className="size-4" />
      </ControlButton>
      <ControlButton onClick={onFullscreen} label="Fullscreen">
        <Expand className="size-4" />
      </ControlButton>
      <ControlButton onClick={onToggleHeat} label="Toggle heat overlay" active={heatActive}>
        <Thermometer className="size-4" />
      </ControlButton>
    </div>
  );
}

export function MapLayerToggle({
  viewMode,
  onChange,
}: {
  viewMode: "vector" | "satellite";
  onChange: (mode: "vector" | "satellite") => void;
}) {
  return (
    <div className="absolute right-4 top-4 z-10 flex overflow-hidden rounded-md border border-surface-border bg-surface-2/95 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={() => onChange("vector")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
          viewMode === "vector"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-surface-3"
        )}
      >
        <Layers className="size-3.5" />
        Vector
      </button>
      <button
        type="button"
        onClick={() => onChange("satellite")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
          viewMode === "satellite"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-surface-3"
        )}
      >
        <Satellite className="size-3.5" />
        Satellite
      </button>
    </div>
  );
}
