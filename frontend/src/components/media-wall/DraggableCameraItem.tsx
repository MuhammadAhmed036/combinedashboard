"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star } from "lucide-react";
import type { Camera } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DraggableCameraItem({
  camera,
  isFavorite,
  onToggleFavorite,
  isAssigned,
  disabled,
}: {
  camera: Camera;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isAssigned?: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `camera-${camera.id}`,
    data: { camera },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "group flex items-center gap-2 rounded-md border border-surface-border bg-surface-2 px-2.5 py-1.5 text-xs transition-all select-none",
        isDragging && "opacity-30 border-cyan-400 bg-cyan-950/40 scale-[0.98]",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-grab active:cursor-grabbing hover:border-cyan-500/50 hover:bg-surface-3 touch-none"
      )}
      {...(!disabled ? attributes : {})}
      {...(!disabled ? listeners : {})}
    >
      <div className="cursor-grab active:cursor-grabbing text-muted-foreground group-hover:text-cyan-400 shrink-0">
        <GripVertical className="size-3.5" />
      </div>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          camera.status === "online" ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-slate-600"
        )}
      />
      <span className="min-w-0 flex-1 truncate font-medium text-slate-200 group-hover:text-white">
        {camera.name}
      </span>
      {isAssigned && (
        <span className="shrink-0 px-1 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider text-cyan-300 bg-cyan-950/80 border border-cyan-700/50">
          Wall
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Toggle favorite"
        className="text-muted-foreground hover:text-amber-400 shrink-0 p-0.5 transition-colors cursor-pointer"
      >
        <Star className={cn("size-3.5", isFavorite && "fill-amber-400 text-amber-400")} />
      </button>
    </div>
  );
}
