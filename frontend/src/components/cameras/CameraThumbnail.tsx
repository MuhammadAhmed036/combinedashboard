"use client";

import { useState, useRef, useEffect } from "react";
import { VideoOff, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSharedCameraStream } from "@/lib/webrtcStreamManager";

export function CameraThumbnail({
  seed,
  feedUrl,
  playerUrl,
  offline,
  playing = true,
  interactive = false,
  isStandby = false,
  objectFit = "cover",
  onActivate,
  className,
  children,
}: {
  seed: string;
  feedUrl?: string;
  playerUrl?: string;
  offline?: boolean;
  playing?: boolean;
  interactive?: boolean;
  isStandby?: boolean;
  objectFit?: "cover" | "contain" | "fill";
  onActivate?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [inViewport, setInViewport] = useState(true);
  const [videoFailedUrl, setVideoFailedUrl] = useState<string | null>(null);
  const [imageFailedUrl, setImageFailedUrl] = useState<string | null>(null);

  // Viewport Culling via IntersectionObserver:
  // Off-screen tiles (when user scrolls vertically) immediately disconnect their streams
  // to prevent browser tab crash and GPU decode pipeline exhaustion.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setInViewport(entry.isIntersecting);
        }
      },
      { rootMargin: "150px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const videoFailed = videoFailedUrl === feedUrl;
  const imageFailed = imageFailedUrl === feedUrl;
  const hasPlayer = Boolean(playerUrl);
  const unavailable = offline || (!hasPlayer && (!feedUrl || imageFailed)) || !playing;

  // Active rendering is enabled only when online, inside viewport, and not in standby
  const shouldRenderStream = !unavailable && inViewport && !isStandby;

  // Native multiplexed WebRTC Stream Hub:
  // If multiple tiles show the same camera (e.g. 5x CEO in a 36-grid), they share 1 single WebRTC connection!
  const { stream: webrtcStream } = useSharedCameraStream(seed, shouldRenderStream);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (webrtcStream) {
      if (video.srcObject !== webrtcStream) {
        video.srcObject = webrtcStream;
        video.play().catch(() => {});
      }
    } else {
      video.srcObject = null;
    }
  }, [webrtcStream]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-surface-3 select-none",
        className
      )}
      data-camera={seed}
    >
      {/* ── Native WebRTC Video Player (Multiplexed & Zero IFrame Overhead) ── */}
      {shouldRenderStream && webrtcStream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            "absolute inset-0 size-full bg-black",
            objectFit === "contain" ? "object-contain" : objectFit === "fill" ? "object-fill" : "object-cover",
            interactive ? "pointer-events-auto" : "pointer-events-none"
          )}
        />
      )}

      {/* ── Fallback IFrame Player (only if direct WebRTC didn't establish and hasPlayer is true) ── */}
      {shouldRenderStream && !webrtcStream && hasPlayer && (
        <iframe
          src={playerUrl}
          title={`${seed} live camera`}
          className={cn(
            "absolute inset-0 size-full border-0 bg-black",
            interactive ? "pointer-events-auto" : "pointer-events-none"
          )}
          allow="autoplay; fullscreen; picture-in-picture"
          loading="eager"
          referrerPolicy="no-referrer"
        />
      )}

      {shouldRenderStream && !hasPlayer && !videoFailed && (
        <video
          src={feedUrl}
          className={cn(
            "absolute inset-0 size-full bg-black",
            objectFit === "contain" ? "object-contain" : objectFit === "fill" ? "object-fill" : "object-cover"
          )}
          autoPlay
          muted
          playsInline
          preload="metadata"
          onError={() => setVideoFailedUrl(feedUrl ?? null)}
        />
      )}

      {shouldRenderStream && !hasPlayer && videoFailed && (
        // eslint-disable-next-line @next/next/no-img-element -- supports authenticated MJPEG camera streams.
        <img
          src={feedUrl}
          alt=""
          className={cn(
            "absolute inset-0 size-full bg-black",
            objectFit === "contain" ? "object-contain" : objectFit === "fill" ? "object-fill" : "object-cover"
          )}
          onError={() => setImageFailedUrl(feedUrl ?? null)}
        />
      )}

      {/* ── VMS Hardware Guard: Lightweight Standby State (for 50-100 camera grids) ── */}
      {!unavailable && isStandby && (
        <div
          onMouseEnter={onActivate}
          onClick={onActivate}
          className="absolute inset-0 size-full bg-[#050914] flex flex-col items-center justify-center cursor-pointer group/standby overflow-hidden"
          title="Click or hover to start real-time live stream"
        >
          {/* Subtle CCTV grid scanline overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.5)_51%)] bg-[length:100%_4px] opacity-30 pointer-events-none" />

          {/* CCTV Play Trigger Icon */}
          <div className="relative flex items-center justify-center z-10 transition-transform duration-200 group-hover/standby:scale-110">
            <div className="size-7 rounded-full bg-[#1e2330] border border-slate-600/80 flex items-center justify-center group-hover/standby:bg-amber-400 group-hover/standby:border-amber-400 shadow-md">
              <Play className="size-3 text-slate-200 group-hover/standby:text-black fill-current ml-0.5 transition-colors" />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/80 border border-white/10 text-[8.5px] font-mono text-slate-300 z-10">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="tracking-wider">LIVE FEED</span>
          </div>
        </div>
      )}

      {/* ── Viewport Off-screen placeholder ── */}
      {!unavailable && !inViewport && (
        <div className="absolute inset-0 size-full bg-black/90 flex items-center justify-center text-slate-600 text-[9px] font-mono">
          <span>PAUSED (OFFSCREEN)</span>
        </div>
      )}

      {/* ── Offline / Unavailable State ── */}
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
