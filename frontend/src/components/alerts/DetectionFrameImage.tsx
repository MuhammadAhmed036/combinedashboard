"use client";

import { useState, useEffect } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { directEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { loadRuntimeConfig } from "@/lib/runtimeConfig";
import { cn } from "@/lib/utils";

/**
 * Enterprise Ultra-Fast Detection Frame Image:
 * - Uses direct backend URL (60ms) when available with automatic proxied fallback.
 * - Prevents black boxes with an integrated pulse skeleton loader.
 * - Zero artificial lazy-loading delay for virtualized visible alert items.
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
  const proxiedUrl = `/api/ai/v2/events/${encodeURIComponent(eventId)}/image?kind=raw`;
  const directUrl = directEventImageUrl(eventId);

  const [src, setSrc] = useState(directUrl || proxiedUrl);
  const [isLoaded, setIsLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    const direct = directEventImageUrl(eventId);
    if (direct) {
      setSrc(direct);
    } else {
      setSrc(proxiedUrl);
      loadRuntimeConfig().then((cfg) => {
        if (cfg?.apiBase) {
          const base = cfg.apiBase.endsWith("/") ? cfg.apiBase : `${cfg.apiBase}/`;
          setSrc(`${base}api/v2/events/${encodeURIComponent(eventId)}/image?kind=raw`);
        }
      });
    }
    setIsLoaded(false);
    setFailed(false);
    setTriedFallback(false);
  }, [eventId, proxiedUrl]);

  const handleError = () => {
    if (!triedFallback && src !== proxiedUrl) {
      setTriedFallback(true);
      setSrc(proxiedUrl);
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-surface-3 text-center text-muted-foreground",
          className
        )}
      >
        <ImageOff className="size-4 shrink-0 text-muted-foreground/60" />
        <span className="text-[9px] leading-tight">Frame expired</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-surface-3/50", className)}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-surface-3 flex items-center justify-center animate-pulse">
          <Loader2 className="size-3.5 animate-spin text-cyan-400/70" />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        onError={handleError}
        decoding="async"
        className={cn(
          "size-full object-cover transition-opacity duration-200",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
