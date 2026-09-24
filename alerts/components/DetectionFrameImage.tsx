"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { liveEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { cn } from "@/lib/utils";

/**
 * Renders a detection event's raw frame, falling back to a clear "no longer
 * available" placeholder instead of a broken-image icon when the file has
 * been rotated out by the per-camera retention policy (only ~100 raw
 * images are kept per camera — older events' images do genuinely disappear,
 * this isn't a loading error).
 *
 * Callers must pass `key={eventId}` (or a key that includes it) so the
 * error state resets cleanly when the event changes, instead of syncing it
 * via an effect.
 */
export function DetectionFrameImage({
  eventId,
  alt,
  className,
}: {
  eventId: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-surface-3 text-center text-muted-foreground",
          className
        )}
      >
        <ImageOff className="size-4 shrink-0" />
        <span className="text-[10px] leading-tight">Image expired</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied JPEG from the detection API
    <img
      src={liveEventImageUrl(eventId)}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
