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
            "absolute inset-0 size-full bg-black object-cover",
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
          className="absolute inset-0 size-full bg-black object-cover"
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
          className="absolute inset-0 size-full bg-black object-cover"
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

          {/* Tactical Crosshair Background */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-15">
            <div className="w-12 h-px bg-cyan-400" />
            <div className="h-12 w-px bg-cyan-400 absolute" />
          </div>

          {/* Live Radar Pulse Icon */}
          <div className="relative flex items-center justify-center z-10 transition-transform duration-200 group-hover/standby:scale-110">
            <div className="size-7 rounded-full border border-cyan-500/40 animate-ping opacity-30" />
            <div className="absolute size-6 rounded-full bg-cyan-950/80 border border-cyan-400/60 flex items-center justify-center group-hover/standby:bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              <Play className="size-2.5 text-cyan-300 group-hover/standby:text-black fill-current ml-0.5 transition-colors" />
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 border border-cyan-500/30 text-[8px] font-mono text-cyan-300/90 z-10 shadow-sm">
            <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="tracking-wider">HOVER TO STREAM</span>
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
