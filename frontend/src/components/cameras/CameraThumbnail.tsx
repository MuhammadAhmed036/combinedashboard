"use client";

import { useState } from "react";
import { VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function CameraThumbnail({
  seed,
  feedUrl,
  playerUrl,
  offline,
  playing = true,
  interactive = false,
  className,
  children,
}: {
  seed: string;
  feedUrl?: string;
  playerUrl?: string;
  offline?: boolean;
  playing?: boolean;
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const [videoFailedUrl, setVideoFailedUrl] = useState<string | null>(null);
  const [imageFailedUrl, setImageFailedUrl] = useState<string | null>(null);

  const videoFailed = videoFailedUrl === feedUrl;
  const imageFailed = imageFailedUrl === feedUrl;
  const hasPlayer = Boolean(playerUrl);
  const unavailable = offline || (!hasPlayer && (!feedUrl || imageFailed)) || !playing;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-surface-3",
        className
      )}
      data-camera={seed}
    >
      {!unavailable && hasPlayer && (
        <iframe
          src={playerUrl}
          title={`${seed} live camera`}
          className={cn(
            "absolute inset-0 size-full border-0 bg-black",
            interactive ? "pointer-events-auto" : "pointer-events-none"
          )}
          allow="autoplay; fullscreen; picture-in-picture"
          loading={interactive ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
        />
      )}

      {!unavailable && !hasPlayer && !videoFailed && (
        <video
          src={feedUrl}
          className="absolute inset-0 size-full bg-black object-cover"
          autoPlay
          muted
          playsInline
          preload="metadata"
          onError={() => setVideoFailedUrl(feedUrl ?? null)}
        />
      )}

      {!unavailable && !hasPlayer && videoFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- supports authenticated MJPEG camera streams.
        <img
          src={feedUrl}
          alt=""
          className="absolute inset-0 size-full bg-black object-cover"
          onError={() => setImageFailedUrl(feedUrl ?? null)}
        />
      )}

      {unavailable && (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <VideoOff className="size-6" />
          <span className="text-xs font-medium">
            {offline ? "Camera Offline" : playing ? "Feed unavailable" : "Playback paused"}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
