"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Users, VideoOff, WifiOff } from "lucide-react";
import { useAlertPresenceStore } from "@/lib/store/useAlertPresenceStore";
import {
  ABSENCE_PRESENCE_GRACE_MS,
  absenceThresholdSeconds,
  formatAbsenceThreshold,
} from "@/lib/alertConditions";
import type { AlertRuleV2 } from "@/lib/types";
import { cn } from "@/lib/utils";

const TICK_MS = 5_000;
const STATUS_POLL_MS = 10_000;

interface CameraLiveStatus {
  cameraStatus: "RUNNING" | "STOPPED" | string;
  webrtcStatus: "ACTIVE" | "ERROR" | string;
}

/**
 * Live, continuously-updating status for an Absence Alert Rule:
 * 1. Verifies Camera Status from Streaming Server API (Running / Stopped)
 * 2. Verifies WebRTC health (Active / Error)
 * 3. Informs the user immediately if camera or WebRTC has stopped
 * 4. Only applies normal YOLO detection / ROI bounding-box absence logic
 *    when both Streaming Server is running and WebRTC is active.
 */
export function AbsenceLiveStatus({ rule, className }: { rule: AlertRuleV2; className?: string }) {
  const lastPersonAtMs = useAlertPresenceStore((s) => s.lastPersonAtByRule[rule.alertId]);
  const lastResolvedSeconds = useAlertPresenceStore(
    (s) => s.lastResolvedDurationSecondsByRule[rule.alertId]
  );
  const [now, setNow] = useState(() => Date.now());

  // Initialize with rule's metadata if present
  const [liveStatus, setLiveStatus] = useState<CameraLiveStatus>({
    cameraStatus: rule.streamingStatus?.toUpperCase() || "RUNNING",
    webrtcStatus: rule.webRtcStatus?.toUpperCase() || "ACTIVE",
  });

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/cameras/${encodeURIComponent(rule.cameraId)}/frame-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) {
          setLiveStatus({
            cameraStatus: data.cameraStatus || "RUNNING",
            webrtcStatus: data.webrtc?.status || "ACTIVE",
          });
        }
      } catch {}
    };

    fetchStatus();
    const pollInterval = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => {
      mounted = false;
      clearInterval(pollInterval);
    };
  }, [rule.cameraId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const isCameraRunning = liveStatus.cameraStatus === "RUNNING";
  const isWebRtcActive = liveStatus.webrtcStatus === "ACTIVE";

  const thresholdMs = absenceThresholdSeconds(rule) * 1000;
  const elapsedMs = lastPersonAtMs !== undefined ? Math.max(0, now - lastPersonAtMs) : 0;
  const alerting = elapsedMs >= thresholdMs;
  const duration = formatAbsenceThreshold(Math.round(elapsedMs / 1000));
  const thresholdStr = formatAbsenceThreshold(absenceThresholdSeconds(rule));

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* 2 Live Verification Symbols: Streaming Server (ffmpeg) & WebRTC status */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Stream Server Symbol */}
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border",
            isCameraRunning
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          )}
          title={`Streaming Server: ${isCameraRunning ? "Running" : "Stopped"}`}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isCameraRunning ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
            )}
          />
          Stream: {isCameraRunning ? "Running" : "Stopped"}
        </span>

        {/* WebRTC Gateway Symbol */}
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border",
            isWebRtcActive
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          )}
          title={`WebRTC Stream: ${isWebRtcActive ? "Active" : "Error"}`}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isWebRtcActive ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
            )}
          />
          WebRTC: {isWebRtcActive ? "Active" : "Error"}
        </span>
      </div>

      {/* Actual Diagnostics & Absence Verification Pipeline */}
      {!isCameraRunning ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
          <VideoOff className="size-3.5 shrink-0" />
          <span>Camera stopped on Streaming Server (ffmpeg stopped)</span>
        </div>
      ) : !isWebRtcActive ? (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
          <WifiOff className="size-3.5 shrink-0" />
          <span>WebRTC stream error / unreachable</span>
        </div>
      ) : lastPersonAtMs === undefined ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5 shrink-0" />
          <span>Waiting for live YOLO detections…</span>
        </div>
      ) : elapsedMs < ABSENCE_PRESENCE_GRACE_MS ? (
        <div className="flex items-center gap-1.5 text-xs font-medium text-status-active">
          <Users className="size-3.5 shrink-0" />
          <span>
            {lastResolvedSeconds !== undefined
              ? `Person present — was absent for ${formatAbsenceThreshold(lastResolvedSeconds)}`
              : "Person present in zone — monitoring"}
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            alerting ? "text-destructive font-semibold" : "text-severity-medium"
          )}
        >
          {alerting ? (
            <AlertTriangle className="size-3.5 shrink-0" />
          ) : (
            <Clock className="size-3.5 shrink-0" />
          )}
          <span>
            {alerting
              ? `Absence Alert: No person detected for ${duration}`
              : `No person detected for ${duration} (threshold ${thresholdStr})`}
          </span>
        </div>
      )}
    </div>
  );
}
