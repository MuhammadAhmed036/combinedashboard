"use client";

import { useRef, useState } from "react";
import type { AlertBoundingBox } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function RegionDrawCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  value,
  onChange,
  className,
}: {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  value: AlertBoundingBox | null;
  onChange: (box: AlertBoundingBox) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function clientToImagePixels(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const fracX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fracY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x: fracX * imageWidth, y: fracY * imageHeight };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = clientToImagePixels(event.clientX, event.clientY);
    setDrag({ startX: x, startY: y, currentX: x, currentY: y });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const { x, y } = clientToImagePixels(event.clientX, event.clientY);
    setDrag({ ...drag, currentX: x, currentY: y });
  }

  function handlePointerUp() {
    if (!drag) return;
    const x1 = Math.round(Math.min(drag.startX, drag.currentX));
    const y1 = Math.round(Math.min(drag.startY, drag.currentY));
    const x2 = Math.round(Math.max(drag.startX, drag.currentX));
    const y2 = Math.round(Math.max(drag.startY, drag.currentY));
    setDrag(null);
    if (x2 - x1 < 8 || y2 - y1 < 8) return; // ignore accidental clicks/taps
    onChange({ x1, y1, x2, y2, region: "alert_area_1" });
  }

  const box = drag
    ? {
        x1: Math.min(drag.startX, drag.currentX),
        y1: Math.min(drag.startY, drag.currentY),
        x2: Math.max(drag.startX, drag.currentX),
        y2: Math.max(drag.startY, drag.currentY),
      }
    : value;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        "relative aspect-video w-full touch-none overflow-hidden rounded-lg border border-surface-border bg-black select-none",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- proxied JPEG snapshot, not a Next-optimizable static asset */}
      <img
        src={imageUrl}
        alt="Camera snapshot for region drawing"
        draggable={false}
        className="pointer-events-none h-full w-full object-contain"
      />
      {box && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/20"
          style={{
            left: `${(box.x1 / imageWidth) * 100}%`,
            top: `${(box.y1 / imageHeight) * 100}%`,
            width: `${((box.x2 - box.x1) / imageWidth) * 100}%`,
            height: `${((box.y2 - box.y1) / imageHeight) * 100}%`,
          }}
        />
      )}
      {!box && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/70">
          Click and drag to draw the alert zone
        </div>
      )}
    </div>
  );
}
