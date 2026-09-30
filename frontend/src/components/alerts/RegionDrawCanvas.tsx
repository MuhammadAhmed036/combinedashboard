"use client";

import { useEffect, useRef, useState } from "react";
import type { AlertBoundingBox } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface RegionDrawCanvasProps {
  imageUrl?: string | null;
  videoStream?: MediaStream | null;
  imageWidth?: number;
  imageHeight?: number;
  value: AlertBoundingBox | null;
  onChange: (box: AlertBoundingBox) => void;
  className?: string;
  onDimensionsReady?: (dims: { width: number; height: number }) => void;
}

export function RegionDrawCanvas({
  imageUrl,
  videoStream,
  imageWidth = 1920,
  imageHeight = 1080,
  value,
  onChange,
  className,
  onDimensionsReady,
}: RegionDrawCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [mediaDims, setMediaDims] = useState<{ width: number; height: number }>({
    width: imageWidth || 1920,
    height: imageHeight || 1080,
  });

  useEffect(() => {
    if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
      setMediaDims({ width: imageWidth, height: imageHeight });
    }
  }, [imageWidth, imageHeight]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (videoStream) {
      if (video.srcObject !== videoStream) {
        video.srcObject = videoStream;
        video.play().catch(() => {});
      }
    } else {
      video.srcObject = null;
    }
  }, [videoStream]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const vw = videoRef.current.videoWidth || 1920;
      const vh = videoRef.current.videoHeight || 1080;
      if (vw > 0 && vh > 0) {
        setMediaDims({ width: vw, height: vh });
        onDimensionsReady?.({ width: vw, height: vh });
      }
    }
  };

  const effectiveWidth = mediaDims.width || 1920;
  const effectiveHeight = mediaDims.height || 1080;

  function clientToImagePixels(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const fracX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const fracY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x: fracX * effectiveWidth, y: fracY * effectiveHeight };
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
        "relative aspect-video w-full touch-none overflow-hidden rounded-lg border border-surface-border bg-black select-none cursor-crosshair",
        className
      )}
    >
      {videoStream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={handleLoadedMetadata}
          className="pointer-events-none h-full w-full object-contain"
        />
      ) : imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- proxied JPEG snapshot, not a Next-optimizable static asset */
        <img
          src={imageUrl}
          alt="Camera snapshot for region drawing"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              setMediaDims({ width: img.naturalWidth, height: img.naturalHeight });
              onDimensionsReady?.({ width: img.naturalWidth, height: img.naturalHeight });
            }
          }}
          className="pointer-events-none h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Waiting for live video feed or snapshot...
        </div>
      )}

      {box && (
        <div
          className="pointer-events-none absolute border-2 border-primary bg-primary/20"
          style={{
            left: `${(box.x1 / effectiveWidth) * 100}%`,
            top: `${(box.y1 / effectiveHeight) * 100}%`,
            width: `${((box.x2 - box.x1) / effectiveWidth) * 100}%`,
            height: `${((box.y2 - box.y1) / effectiveHeight) * 100}%`,
          }}
        >
          <div className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
            Alert Zone
          </div>
        </div>
      )}

      {!box && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80 drop-shadow">
          Click and drag to draw the alert zone
        </div>
      )}
    </div>
  );
}
