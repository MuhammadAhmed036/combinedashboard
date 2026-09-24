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
  disabled,
}: {
  camera: Camera;
  isFavorite: boolean;
  onToggleFavorite: () => void;
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
        "flex items-center gap-2 rounded-md border border-surface-border bg-surface-2 px-2 py-1.5 text-sm",
        isDragging && "opacity-40",
        disabled && "opacity-50"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="Drag camera"
      >
        <GripVertical className="size-4" />
      </button>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          camera.status === "online" ? "bg-status-active" : "bg-status-resolved"
        )}
      />
      <span className="min-w-0 flex-1 truncate">{camera.name}</span>
      <button onClick={onToggleFavorite} aria-label="Toggle favorite" className="text-muted-foreground hover:text-severity-medium">
        <Star className={cn("size-3.5", isFavorite && "fill-severity-medium text-severity-medium")} />
      </button>
    </div>
  );
}
