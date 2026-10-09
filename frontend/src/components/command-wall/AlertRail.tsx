"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Filter,
  X,
  Search,
  Camera,
  Clock,
  Pencil,
  Trash2,
  Play,
  Pause,
  Activity,
  Check,
  Radio,
  SlidersHorizontal,
  Download,
  Copy,
  Maximize2,
  User,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { liveEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { useSharedCameraStream } from "@/lib/webrtcStreamManager";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/formatters";
import {
  useAllAlertEvents,
  useAlertHistory,
  useAlertRules,
  useDeleteAlertRule,
  useUpdateAlertRuleStatus,
  useUpdateAlertRuleDetails,
  useMarkAlertSeen,
} from "@/lib/hooks/useAlertRules";
import { useAlertSeenBaselineStore } from "@/lib/store/useAlertSeenBaselineStore";
import { effectiveUnseenCount } from "@/lib/alertUnseen";
import type { AlertMatchEvent, AlertRuleV2, AlertCategory, Camera as CameraType } from "@/lib/types";
import { CATEGORY_ACCENT, CATEGORY_LABEL, classAccent, classLabel } from "./alertVisuals";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(str?: string | null): boolean {
  if (!str) return false;
  return UUID_REGEX.test(str.trim());
}

// ─── Virtual Scroller Constants ───────────────────────────────────────────────
const ITEM_HEIGHT = 74; // 66px card + 8px margin
const OVERSCAN = 5;

// ─── Event Item in Live Feed ──────────────────────────────────────────────────

function AlertEventItem({
  event,
  onInspect,
}: {
  event: AlertMatchEvent;
  onInspect: (event: AlertMatchEvent) => void;
}) {
  const primaryClass = event.classNames?.[0] ?? "person";
  const categoryColor = CATEGORY_ACCENT[event.category || "medium"];
  const classColor = classAccent(primaryClass);
  const ts = event.detectionTs ?? event.createdAt;
  const cameraTitle = event.cameraId || "Camera";

  return (
    <article
      onClick={() => onInspect(event)}
      className="group relative mx-1.5 my-1 overflow-hidden rounded-[8px] bg-surface-2 cursor-pointer transition-all duration-150 hover:bg-surface-3/80 select-none"
      style={{
        height: 66,
        border: `1.5px solid ${categoryColor}`,
        boxShadow: `0 0 8px ${categoryColor}20`,
      }}
    >
      <div className="flex h-full">
        {/* Left: Picture container */}
        <div className="relative shrink-0 overflow-hidden bg-surface-3 w-[48%]">
          {event.eventId ? (
            <DetectionFrameImage
              eventId={event.eventId}
              cameraId={event.cameraId}
              alt="Matched frame"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <span className="text-[10px]">No Image</span>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium text-white shadow flex items-center gap-1">
              <Maximize2 className="size-2.5 text-slate-300" />
              Forensic
            </span>
          </div>

          <div
            className="absolute bottom-1 left-1 rounded-[3px] px-1 py-0.2 text-[8px] font-bold text-black leading-none"
            style={{ backgroundColor: classColor }}
          >
            {classLabel(primaryClass)}
          </div>
        </div>

        {/* Right: metadata — Camera Name + Date & Time (No raw UUID / alertId) */}
        <div className="flex flex-col justify-center gap-2 min-w-0 flex-1 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white leading-tight">
            <Camera className="size-3 shrink-0 text-slate-300" />
            <span className="truncate">{cameraTitle}</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="size-2.5 shrink-0 text-slate-400" />
            <span className="truncate">{ts ? formatDateTime(ts) : "—"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Virtualized Alert Feed (Maintains 60 FPS under 1,000+ alerts) ───────────

function VirtualAlertEventList({
  events,
  onInspect,
}: {
  events: AlertMatchEvent[];
  onInspect: (event: AlertMatchEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalHeight = events.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    events.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );

  const visibleEvents = events.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  return (
    <div
      ref={containerRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="min-h-0 flex-1 overflow-y-auto will-change-scroll"
      style={{ position: "relative" }}
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`,
          }}
        >
          {visibleEvents.map((event, idx) => (
            <AlertEventItem
              key={`${event.eventId || "evt"}-${event.id || startIndex + idx}`}
              event={event}
              onInspect={onInspect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Forensic Evidence Modal (Enterprise-Scale High-Res Forensics Suite) ───────

function ForensicEvidenceModal({
  event,
  onClose,
}: {
  event: AlertMatchEvent | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [useLiveStream, setUseLiveStream] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const cameraSnapshotUrl = event?.cameraId ? `/api/cameras/${encodeURIComponent(event.cameraId)}/snapshot` : null;

  useEffect(() => {
    setZoomLevel(1);
    setUseLiveStream(false);
    setImageSrc(event?.eventId ? liveEventImageUrl(event.eventId) : cameraSnapshotUrl);
  }, [event?.eventId, cameraSnapshotUrl]);

  const { stream: liveWebRtcStream } = useSharedCameraStream(
    event?.cameraId && useLiveStream ? event.cameraId : ""
  );

  useEffect(() => {
    if (useLiveStream && videoRef.current && liveWebRtcStream) {
      videoRef.current.srcObject = liveWebRtcStream;
      videoRef.current.play().catch(() => {});
    }
  }, [useLiveStream, liveWebRtcStream]);

  if (!event) return null;

  const categoryColor = CATEGORY_ACCENT[event.category || "medium"];
  const primaryClass = event.classNames?.[0] ?? "person";
  const ts = event.detectionTs ?? event.createdAt;
  const imageUrl = event.eventId ? liveEventImageUrl(event.eventId) : null;

  const handleDownload = () => {
    const downloadUrl = imageSrc || imageUrl;
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `alert_${event.cameraId}_${event.eventId || Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLog = () => {
    const displayRuleName = (event.ruleName && !isUuid(event.ruleName))
      ? event.ruleName
      : (event.ruleLabel && !isUuid(event.ruleLabel))
      ? event.ruleLabel
      : `${event.cameraId} Alert`;

    const logData = [
      `Alert Rule: ${displayRuleName}`,
      `Camera: ${event.cameraId}`,
      `Severity: ${CATEGORY_LABEL[event.category || "medium"]}`,
      `Detected Target: ${primaryClass.toUpperCase()}`,
      `Subjects Inside Zone: ${event.personCountInside ?? 0}`,
      `Subjects Outside Zone: ${event.personCountOutside ?? 0}`,
      `Recorded At: ${ts ? formatDateTime(ts) : "—"}`,
    ].join("\n");

    navigator.clipboard.writeText(logData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const ruleTitle = (event.ruleName && !isUuid(event.ruleName))
    ? event.ruleName
    : (event.ruleLabel && !isUuid(event.ruleLabel))
    ? event.ruleLabel
    : `${event.cameraId} Alert`;

  return (
    <Dialog open={Boolean(event)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[96vw] max-w-7xl sm:max-w-[95vw] md:max-w-6xl xl:max-w-7xl h-[88vh] max-h-[920px] p-0 flex flex-col overflow-hidden bg-[#060a12] border border-slate-800 text-white rounded-2xl shadow-2xl z-[100]"
      >
        {/* Enterprise Top Navigation & Status Bar */}
        <div className="h-14 shrink-0 px-6 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between z-20">
          <div className="flex items-center gap-3.5 min-w-0">
            <span
              className="h-3 w-3 rounded-full shrink-0 shadow-lg animate-pulse"
              style={{
                backgroundColor: categoryColor,
                boxShadow: `0 0 12px ${categoryColor}`,
              }}
            />
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="font-extrabold text-base lg:text-lg text-white tracking-tight truncate">
                {ruleTitle}
              </h2>
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shrink-0 shadow-sm"
                style={{ backgroundColor: categoryColor }}
              >
                {CATEGORY_LABEL[event.category || "medium"]}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 pl-3 border-l border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <Camera className="size-3.5 text-slate-400" />
                {event.cameraId}
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <Clock className="size-3.5 text-slate-400" />
                {ts ? formatDateTime(ts) : "—"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            title="Close viewer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Forensic Canvas & Command Telemetry Grid */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Main Visual Surveillance Canvas (Hero Area - 75% on desktop) */}
          <div className="lg:col-span-8 xl:col-span-9 relative flex flex-col items-center justify-center bg-[#0e1117] border-b lg:border-b-0 lg:border-r border-slate-800/80 overflow-hidden select-none">
            {/* Top-left high-res indicator */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#161922]/90 backdrop-blur-md border border-slate-700/80 text-[10.5px] text-slate-200 font-mono shadow-md">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>HIGH-RES DETECTION FRAME</span>
            </div>

            {/* Top-right interactive image toolbar */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 shadow-lg">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.25))}
                disabled={zoomLevel <= 1}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 disabled:opacity-40 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-300 px-1 font-semibold min-w-[42px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                disabled={zoomLevel >= 3}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 disabled:opacity-40 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="size-4" />
              </button>
              {zoomLevel > 1 && (
                <button
                  type="button"
                  onClick={() => setZoomLevel(1)}
                  className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-slate-850 transition-colors"
                  title="Reset Zoom"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              )}
              {event.cameraId && (
                <button
                  type="button"
                  onClick={() => setUseLiveStream(!useLiveStream)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ml-1",
                    useLiveStream
                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                      : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                  )}
                  title="Toggle real-time live camera stream"
                >
                  <Radio className={cn("size-3.5", useLiveStream ? "animate-pulse text-emerald-400" : "")} />
                  <span>{useLiveStream ? "Live WebRTC" : "View Live Feed"}</span>
                </button>
              )}
              {(imageSrc || imageUrl) && (
                <a
                  href={(imageSrc || imageUrl) || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-850 transition-colors ml-1 border-l border-slate-800 pl-2"
                  title="Open high-res frame in new window"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>

            {/* Surveillance Frame Display */}
            <div className="w-full h-full flex items-center justify-center p-4 lg:p-6 overflow-auto relative">
              {useLiveStream ? (
                <div className="relative w-full h-full max-h-[72vh] flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full max-h-[72vh] object-contain rounded-xl shadow-2xl border border-slate-800/80"
                  />
                  {event.boundingBox && (
                    <div
                      className="pointer-events-none absolute border-2 border-primary bg-primary/20"
                      style={{
                        left: `${(Number(event.boundingBox.x1) / 1920) * 100}%`,
                        top: `${(Number(event.boundingBox.y1) / 1080) * 100}%`,
                        width: `${((Number(event.boundingBox.x2) - Number(event.boundingBox.x1)) / 1920) * 100}%`,
                        height: `${((Number(event.boundingBox.y2) - Number(event.boundingBox.y1)) / 1080) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                        Alert Zone
                      </span>
                    </div>
                  )}
                </div>
              ) : (imageSrc || imageUrl) ? (
                <div className="relative w-full h-full max-h-[72vh] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageSrc || imageUrl || undefined}
                    alt="Surveillance Forensic Frame"
                    onError={() => {
                      const isAbsence = event?.eventId?.startsWith("absence-") || event?.eventId?.startsWith("live-");
                      if (!isAbsence && cameraSnapshotUrl && imageSrc !== cameraSnapshotUrl) {
                        setImageSrc(cameraSnapshotUrl);
                      }
                    }}
                    style={{ transform: `scale(${zoomLevel})` }}
                    className="w-full h-full max-h-[72vh] object-contain rounded-xl shadow-2xl border border-slate-800/80 transition-transform duration-200 ease-out"
                  />
                  {event.boundingBox && (
                    <div
                      className="pointer-events-none absolute border-2 border-primary bg-primary/20"
                      style={{
                        left: `${(Number(event.boundingBox.x1) / 1920) * 100}%`,
                        top: `${(Number(event.boundingBox.y1) / 1080) * 100}%`,
                        width: `${((Number(event.boundingBox.x2) - Number(event.boundingBox.x1)) / 1920) * 100}%`,
                        height: `${((Number(event.boundingBox.y2) - Number(event.boundingBox.y1)) / 1080) * 100}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                        Alert Zone
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500 text-sm gap-3">
                  <Camera className="size-12 text-slate-600" />
                  <span>No forensic frame available for this event</span>
                </div>
              )}
            </div>

            {/* Bottom floating detection summary badge */}
            <div className="absolute bottom-4 inset-x-auto z-10 flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#161922]/90 backdrop-blur-md border border-slate-700/80 shadow-md text-xs text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <User className="size-3.5 text-slate-400" />
                Target: <span className="text-white capitalize">{primaryClass}</span>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-bold font-mono">
                {event.personCountInside ?? 0} in zone
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400">
                {event.personCountOutside ?? 0} outside
              </span>
            </div>
          </div>

          {/* Right Command & Telemetry Sidebar (25% on desktop) */}
          <div className="lg:col-span-4 xl:col-span-3 bg-[#161922] border-l border-[#282e3b] p-6 flex flex-col justify-between overflow-y-auto space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Activity className="size-3.5 text-slate-400" />
                  Telemetry & Insights
                </span>
                <span className="text-[10px] font-mono text-slate-300 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded-full">
                  VERIFIED EVENT
                </span>
              </div>

              {/* Target Classification KPI Card */}
              <div className="rounded-xl bg-[#1c202b] border border-slate-800/80 p-4 shadow-sm">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Detected Target
                </span>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                      <User className="size-4" />
                    </div>
                    <span className="text-lg font-black text-white capitalize">
                      {primaryClass}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold flex items-center gap-1">
                    <ShieldAlert className="size-3" />
                    Triggered
                  </span>
                </div>
              </div>

              {/* Zone Activity Metrics (Inside vs Outside) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">
                    Inside Region
                  </span>
                  <span className="text-3xl font-black text-amber-300 font-mono my-1">
                    {event.personCountInside ?? 0}
                  </span>
                  <span className="text-[10px] text-amber-400/80">
                    Subjects in zone
                  </span>
                </div>

                <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5 flex flex-col justify-between shadow-sm">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Outside Region
                  </span>
                  <span className="text-3xl font-black text-slate-200 font-mono my-1">
                    {event.personCountOutside ?? 0}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Perimeter subjects
                  </span>
                </div>
              </div>

              {/* Event Metadata Card */}
              <div className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-4 space-y-2.5 text-xs shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-slate-400 text-[11px]">Camera Source</span>
                  <span className="font-semibold text-white truncate max-w-[170px] text-right">
                    {event.cameraId}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                  <span className="text-slate-400 text-[11px]">Severity Tier</span>
                  <span
                    className="font-bold text-[11px] uppercase tracking-wide"
                    style={{ color: categoryColor }}
                  >
                    {CATEGORY_LABEL[event.category || "medium"]}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-400 text-[11px]">Recorded At</span>
                  <span className="font-mono text-slate-300 text-[11px]">
                    {ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Enterprise Action Center */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              {imageUrl && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full h-11 px-4 rounded-xl text-xs font-bold text-white bg-[#2563eb] hover:bg-[#1d4ed8] shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="size-4" />
                  <span>Download Forensic Evidence (.JPG)</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyLog}
                className="w-full h-10 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                <span>{copied ? "Copied Incident Summary!" : "Copy Incident Summary"}</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rule Card in Rules Tab ───────────────────────────────────────────────────

function ConfiguredRuleItem({
  rule,
  onEdit,
  onDelete,
  onToggleStatus,
  onViewAlerts,
}: {
  rule: AlertRuleV2;
  onEdit: (rule: AlertRuleV2) => void;
  onDelete: (rule: AlertRuleV2) => void;
  onToggleStatus: (rule: AlertRuleV2) => void;
  onViewAlerts: (rule: AlertRuleV2) => void;
}) {
  const categoryColor = CATEGORY_ACCENT[rule.category || "medium"];
  const isActive = rule.status === "active";
  const markSeen = useMarkAlertSeen();
  const baseline = useAlertSeenBaselineStore((s) => s.baselines[rule.alertId] ?? 0);
  const unseen = effectiveUnseenCount(rule, baseline);

  const [camStatus, setCamStatus] = useState<"RUNNING" | "STOPPED" | "LOADING">("LOADING");
  const [webrtcStatus, setWebrtcStatus] = useState<"ACTIVE" | "ERROR" | "LOADING">("LOADING");

  useEffect(() => {
    if (!rule.cameraId) return;
    let isMounted = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/cameras/${encodeURIComponent(rule.cameraId)}/frame-status`);
        if (!res.ok) throw new Error("Status fetch failed");
        const data = await res.json();
        if (isMounted) {
          setCamStatus(data.cameraStatus === "RUNNING" ? "RUNNING" : "STOPPED");
          setWebrtcStatus(data.webrtc?.isLive ? "ACTIVE" : "ERROR");
        }
      } catch {
        if (isMounted) {
          setCamStatus("STOPPED");
          setWebrtcStatus("ERROR");
        }
      }
    };

    fetchStatus();
    // Refresh every 1 minute (60 seconds)
    const interval = setInterval(fetchStatus, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [rule.cameraId]);

  return (
    <article
      className="relative mx-1.5 my-1.5 rounded-[8px] bg-surface-2 p-2.5 transition-all"
      style={{
        border: `1.5px solid ${categoryColor}80`,
        boxShadow: `0 0 6px ${categoryColor}15`,
      }}
    >
      {/* Top: Name & Category Indicator */}
      <div className="flex items-start justify-between gap-1.5 mb-1.5">
        <div
          onClick={() => onViewAlerts(rule)}
          className="min-w-0 flex-1 cursor-pointer group"
          title="Click to view alerts for this rule"
        >
          <div className="truncate text-xs font-bold text-white leading-tight group-hover:text-slate-200 transition-colors">
            {rule.name && !isUuid(rule.name) ? rule.name : (rule.label && !isUuid(rule.label) ? `${rule.cameraId} (${rule.label})` : rule.cameraId)}
          </div>
          {rule.name && !isUuid(rule.name) && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
              <Camera className="size-2.5 text-slate-400" />
              <span className="truncate">{rule.cameraId}</span>
            </div>
          )}
        </div>

        {/* Category Pill */}
        <span
          className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[8.5px] font-bold text-white uppercase tracking-wider"
          style={{ backgroundColor: categoryColor }}
        >
          {CATEGORY_LABEL[rule.category || "medium"]}
        </span>
      </div>

      {/* Real-time Camera Status & WebRTC Stream Status Badges (1-min auto refresh) */}
      <div className="flex items-center gap-1.5 my-1.5 flex-wrap">
        {/* Symbol 1: Camera FFmpeg Status */}
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold border transition-all select-none",
            camStatus === "RUNNING"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : camStatus === "STOPPED"
              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
              : "bg-surface-3 text-muted-foreground border-surface-border"
          )}
          title={
            camStatus === "RUNNING"
              ? "Camera feed (FFmpeg) is active and running"
              : camStatus === "STOPPED"
              ? "Camera feed (FFmpeg) is stopped / offline"
              : "Checking camera status..."
          }
        >
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              camStatus === "RUNNING"
                ? "bg-emerald-400 animate-pulse"
                : camStatus === "STOPPED"
                ? "bg-rose-500"
                : "bg-slate-500"
            )}
          />
          <span>CAM: {camStatus === "RUNNING" ? "Running" : camStatus === "STOPPED" ? "Offline" : "Checking..."}</span>
        </div>

        {/* Symbol 2: WebRTC Live Stream Status */}
        <div
          className={cn(
            "inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold border transition-all select-none",
            webrtcStatus === "ACTIVE"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : webrtcStatus === "ERROR"
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
              : "bg-surface-3 text-muted-foreground border-surface-border"
          )}
          title={
            webrtcStatus === "ACTIVE"
              ? "WebRTC live video stream is healthy and active"
              : webrtcStatus === "ERROR"
              ? "WebRTC live stream connection error or offline"
              : "Checking WebRTC stream..."
          }
        >
          <Radio
            className={cn(
              "size-2.5 shrink-0",
              webrtcStatus === "ACTIVE" ? "text-emerald-400 animate-pulse" : "text-amber-400"
            )}
          />
          <span>STREAM: {webrtcStatus === "ACTIVE" ? "Live" : webrtcStatus === "ERROR" ? "Down" : "Checking..."}</span>
        </div>
      </div>

      {/* Middle: Trigger Counts — clickable to view alerts for this rule */}
      <div
        className="my-2 w-full rounded-[6px] bg-[#111319] p-2 flex flex-col gap-1.5 border border-slate-800/80 hover:border-slate-700 hover:bg-[#181c24] transition-all group select-none text-left"
      >
        <div
          onClick={() => {
            onViewAlerts(rule);
            if (unseen > 0) markSeen.mutate({ alertId: rule.alertId });
          }}
          className="flex items-center justify-between cursor-pointer"
          title="Click to view alerts for this rule"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-slate-200 transition-colors">
            <Activity className="size-3 text-slate-400 shrink-0" />
            <span className="text-[11px] whitespace-nowrap">Total Alerts:</span>
            <span className="font-bold font-mono text-white text-xs">{rule.eventCount}</span>
          </div>

          <span className="text-[10px] text-blue-400 font-semibold flex items-center gap-0.5 group-hover:underline whitespace-nowrap">
            View Alerts →
          </span>
        </div>

        {unseen > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span className="text-[10px] text-rose-400/90 font-medium">New Matches:</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                markSeen.mutate({ alertId: rule.alertId });
              }}
              title="Click to mark seen and reset counter"
              className="rounded bg-rose-600 hover:bg-rose-500 px-2 py-0.5 text-[9.5px] font-bold text-white whitespace-nowrap cursor-pointer transition-colors shadow-sm"
            >
              +{unseen} new
            </button>
          </div>
        )}
      </div>

      {/* Bottom: Action buttons (Status toggle, Edit, Delete, Mark Seen) */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        {/* Status Toggle */}
        <button
          onClick={() => onToggleStatus(rule)}
          className={cn(
            "flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
            isActive
              ? "bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-500/30"
              : "bg-surface-3 text-muted-foreground hover:bg-surface-3/80 border border-surface-border"
          )}
          title={isActive ? "Rule is active (click to pause)" : "Rule is paused (click to activate)"}
        >
          {isActive ? <Play className="size-2.5 fill-current" /> : <Pause className="size-2.5" />}
          <span>{isActive ? "Active" : "Paused"}</span>
        </button>

        <div className="flex items-center gap-1">
          {/* Mark Seen Button when new alerts exist */}
          {unseen > 0 && (
            <button
              type="button"
              disabled={markSeen.isPending}
              onClick={() => markSeen.mutate({ alertId: rule.alertId })}
              className="flex items-center gap-1 rounded-[4px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-1.5 py-0.5 text-[9.5px] font-medium transition-colors cursor-pointer"
              title="Mark all as seen (reset counter)"
            >
              <Check className="size-2.5 text-emerald-400" />
              <span>Mark Seen</span>
            </button>
          )}

          {/* Edit Button */}
          <button
            onClick={() => onEdit(rule)}
            className="flex size-6 items-center justify-center rounded-[4px] bg-surface-3 text-muted-foreground hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
            title="Edit rule name and category"
          >
            <Pencil className="size-3" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => onDelete(rule)}
            className="flex size-6 items-center justify-center rounded-[4px] bg-surface-3 text-muted-foreground hover:bg-destructive hover:text-white transition-colors cursor-pointer"
            title="Delete this alert rule"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Main AlertRail Component ─────────────────────────────────────────────────

export function AlertRail({ cameras }: { cameras: CameraType[] | undefined }) {
  const [activeTab, setActiveTab] = useState<"live" | "rules">("live");
  const [inspectedEvent, setInspectedEvent] = useState<AlertMatchEvent | null>(null);

  // Filters for Live Events
  const [cameraId, setCameraId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{
    cameraId?: string;
    dateFrom?: string;
    dateTo?: string;
    alertId?: string;
  }>({});

  // Rule drill-down: which rule's alerts are being viewed
  const [selectedRuleForAlerts, setSelectedRuleForAlerts] = useState<AlertRuleV2 | null>(null);

  // Drill into a rule's alerts: switch to live tab filtered by this rule
  const handleViewRuleAlerts = (rule: AlertRuleV2) => {
    setSelectedRuleForAlerts(rule);
    setActiveFilters({ alertId: rule.alertId });
    setActiveTab("live");
  };

  const handleBackToRules = () => {
    setSelectedRuleForAlerts(null);
    setActiveFilters({});
    setActiveTab("rules");
  };

  // Filter for Rules Tab
  const [ruleCameraFilter, setRuleCameraFilter] = useState<string>("all");

  // Edit Dialog State
  const [editingRule, setEditingRule] = useState<AlertRuleV2 | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<AlertCategory>("medium");
  const [editStatus, setEditStatus] = useState("active");

  // Delete Confirmation State
  const [deletingRule, setDeletingRule] = useState<AlertRuleV2 | null>(null);

  // Queries & Mutations
  const { data: allEvents, isLoading: allEventsLoading, error: allEventsError } = useAllAlertEvents(
    activeTab === "live" && !selectedRuleForAlerts ? activeFilters : undefined
  );

  // Dedicated query when a rule is clicked — fetches ONLY that rule's alerts:
  const { data: ruleEvents, isLoading: ruleEventsLoading, error: ruleEventsError } = useAlertHistory(
    selectedRuleForAlerts ? selectedRuleForAlerts.alertId : null
  );

  const events = selectedRuleForAlerts ? ruleEvents : allEvents;
  const eventsLoading = selectedRuleForAlerts ? ruleEventsLoading : allEventsLoading;
  const eventsError = selectedRuleForAlerts ? ruleEventsError : allEventsError;
  const { data: rules, isLoading: rulesLoading } = useAlertRules(
    activeTab === "rules" ? {} : undefined
  );

  const deleteRuleMutation = useDeleteAlertRule();
  const updateStatusMutation = useUpdateAlertRuleStatus();
  const updateDetailsMutation = useUpdateAlertRuleDetails();

  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== undefined);

  // Filtered Rules
  const filteredRules = useMemo<AlertRuleV2[]>(() => {
    if (!rules || !Array.isArray(rules)) return [];
    if (ruleCameraFilter === "all") return rules;
    return rules.filter(
      (r: AlertRuleV2) => r.cameraId.toLowerCase() === ruleCameraFilter.toLowerCase()
    );
  }, [rules, ruleCameraFilter]);

  const handleApplyFilter = () => {
    setActiveFilters({
      cameraId: cameraId === "all" ? undefined : cameraId,
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
    });
    setPopoverOpen(false);
  };

  const clearFilters = () => {
    setCameraId("all");
    setDateFrom("");
    setDateTo("");
    setActiveFilters({});
    setSelectedRuleForAlerts(null);
    setPopoverOpen(false);
  };

  const openEditDialog = (rule: AlertRuleV2) => {
    setEditingRule(rule);
    setEditName(rule.name || rule.label || "");
    setEditCategory(rule.category || "medium");
    setEditStatus(rule.status || "active");
  };

  const handleSaveEdit = async () => {
    if (!editingRule) return;
    await updateDetailsMutation.mutateAsync({
      alertId: editingRule.alertId,
      name: editName.trim() || undefined,
      category: editCategory,
      status: editStatus,
    });
    setEditingRule(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    await deleteRuleMutation.mutateAsync(deletingRule.alertId);
    setDeletingRule(null);
  };

  const handleToggleStatus = (rule: AlertRuleV2) => {
    const nextStatus = rule.status === "active" ? "muted" : "active";
    updateStatusMutation.mutate({ alertId: rule.alertId, status: nextStatus });
  };

  return (
    <aside className="flex min-h-0 flex-col border-l border-surface-border bg-surface-2 overflow-hidden">
      {/* Top Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-3 bg-surface-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectedRuleForAlerts ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={handleBackToRules}
                className="flex items-center gap-1 text-slate-300 hover:text-white text-[11px] font-medium shrink-0 transition-colors"
                title="Back to Rules"
              >
                <SlidersHorizontal className="size-3" />
                <span>Rules</span>
              </button>
              <span className="text-muted-foreground text-[11px]">/</span>
              <span className="truncate text-xs font-semibold text-white">
                {selectedRuleForAlerts.name && !isUuid(selectedRuleForAlerts.name)
                  ? selectedRuleForAlerts.name
                  : (selectedRuleForAlerts.label && !isUuid(selectedRuleForAlerts.label)
                  ? `${selectedRuleForAlerts.cameraId} (${selectedRuleForAlerts.label})`
                  : selectedRuleForAlerts.cameraId)}
              </span>
            </div>
          ) : activeTab === "live" ? (
            hasActiveFilters ? (
              <span className="truncate text-sm font-semibold text-amber-400">
                Alert History
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-status-active animate-pulse" />
                <span className="truncate text-sm font-semibold text-white">Live Alerts</span>
              </div>
            )
          ) : (
            <span className="truncate text-sm font-semibold text-white">Configured Rules</span>
          )}

          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {activeTab === "live" ? events?.length || 0 : filteredRules.length}
          </span>
        </div>

        {/* Action icons in header */}
        <div className="flex items-center gap-1">
          {activeTab === "live" && (
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={hasActiveFilters ? "default" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7 rounded-[5px]", hasActiveFilters && "bg-[#2563eb] text-white hover:bg-[#1d4ed8]")}
                  title="Filter alert history"
                >
                  <Filter className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium leading-none text-xs">Filter Alerts</h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Camera</Label>
                    <Select value={cameraId} onValueChange={setCameraId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="All Cameras" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Cameras</SelectItem>
                        {cameras?.map((c) => (
                          <SelectItem key={c.id} value={c.code}>
                            {c.name || c.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">From Date/Time</Label>
                      <Input
                        type="datetime-local"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-8 text-[11px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">To Date/Time</Label>
                      <Input
                        type="datetime-local"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-8 text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                      Clear
                    </Button>
                    <Button size="sm" onClick={handleApplyFilter} className="h-7 text-xs gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white">
                      <Search className="size-3.5" /> Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {activeTab === "rules" && (
            <Select value={ruleCameraFilter} onValueChange={setRuleCameraFilter}>
              <SelectTrigger className="h-7 text-[11px] w-28 px-2">
                <SelectValue placeholder="All Cams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cameras</SelectItem>
                {cameras?.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.name || c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tabs Bar: Live Alerts vs Configured Rules */}
      <div className="flex border-b border-surface-border bg-surface-1/50 p-1 gap-1">
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-[5px] py-1 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "live"
              ? "bg-[#c01823] text-white shadow-xs"
              : "text-muted-foreground hover:text-white"
          )}
        >
          <Radio className="size-3" />
          <span>{hasActiveFilters ? "History" : "Live Alerts"}</span>
        </button>

        <button
          onClick={() => setActiveTab("rules")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-[5px] py-1 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "rules"
              ? "bg-[#c01823] text-white shadow-xs"
              : "text-muted-foreground hover:text-white"
          )}
        >
          <SlidersHorizontal className="size-3" />
          <span>Rules ({rules?.length ?? 0})</span>
        </button>
      </div>

      {/* Tab 1: Live Feed / Alert History */}
      {activeTab === "live" && (
        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {selectedRuleForAlerts && (
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#182030] border-b border-[#283550] text-[11px] text-slate-200 shrink-0">
              <span className="truncate">
                Rule: <strong className="text-white">
                  {selectedRuleForAlerts.name && !isUuid(selectedRuleForAlerts.name)
                    ? selectedRuleForAlerts.name
                    : (selectedRuleForAlerts.label && !isUuid(selectedRuleForAlerts.label)
                    ? `${selectedRuleForAlerts.cameraId} (${selectedRuleForAlerts.label})`
                    : selectedRuleForAlerts.cameraId)}
                </strong> ({events?.length ?? 0} alerts)
              </span>
              <button
                type="button"
                onClick={handleBackToRules}
                className="text-[10px] text-blue-400 hover:text-white underline font-semibold shrink-0 ml-2"
              >
                ← Back to Rules
              </button>
            </div>
          )}
          {eventsLoading &&
            Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-[66px] mx-1.5 my-1 rounded-[8px] border border-surface-border shrink-0"
              />
            ))}

          {!eventsLoading && (eventsError || !events || events.length === 0) && (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              <div>
                <X className="mx-auto mb-2 size-5 opacity-50" />
                {eventsError ? "Events service offline" : hasActiveFilters ? "No events match this filter" : "No live alerts detected"}
              </div>
            </div>
          )}

          {!eventsLoading && !eventsError && events && events.length > 0 && (
            <VirtualAlertEventList
              events={events}
              onInspect={setInspectedEvent}
            />
          )}
        </div>
      )}

      {/* Tab 2: Configured Alert Rules */}
      {activeTab === "rules" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rulesLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 mx-1.5 my-2 rounded-[8px] border border-surface-border" />
            ))}

          {!rulesLoading && filteredRules.length === 0 && (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              <div>
                <SlidersHorizontal className="mx-auto mb-2 size-5 opacity-40" />
                No alert rules configured for this filter.
              </div>
            </div>
          )}

          {!rulesLoading &&
            filteredRules.map((rule: AlertRuleV2) => (
              <ConfiguredRuleItem
                key={rule.alertId}
                rule={rule}
                onEdit={openEditDialog}
                onDelete={setDeletingRule}
                onToggleStatus={handleToggleStatus}
                onViewAlerts={handleViewRuleAlerts}
              />
            ))}
        </div>
      )}

      {/* Edit Rule Dialog */}
      <Dialog open={Boolean(editingRule)} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Edit Alert Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rule Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Rule Name"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Severity Category</Label>
              <Select value={editCategory} onValueChange={(v) => setEditCategory(v as AlertCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical / High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="muted">Paused / Muted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingRule(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={updateDetailsMutation.isPending}
              className="h-8 text-xs gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            >
              <Check className="size-3.5" />
              <span>{updateDetailsMutation.isPending ? "Saving..." : "Save Changes"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Confirmation Dialog */}
      <Dialog open={Boolean(deletingRule)} onOpenChange={(open) => !open && setDeletingRule(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-destructive flex items-center gap-1.5">
              <Trash2 className="size-4" /> Delete Alert Rule
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-white">
              {deletingRule?.name && !isUuid(deletingRule.name)
                ? deletingRule.name
                : (deletingRule?.label && !isUuid(deletingRule.label)
                ? `${deletingRule.cameraId} (${deletingRule.label})`
                : deletingRule?.cameraId || "this rule")}
            </span>
            ? This will remove the rule and stop tracking alerts for it.
          </div>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setDeletingRule(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleteRuleMutation.isPending}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="size-3.5" />
              <span>{deleteRuleMutation.isPending ? "Deleting..." : "Delete Rule"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Central Forensic Evidence Modal */}
      <ForensicEvidenceModal
        event={inspectedEvent}
        onClose={() => setInspectedEvent(null)}
      />
    </aside>
  );
}
