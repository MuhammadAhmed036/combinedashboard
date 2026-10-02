"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Camera as CameraIcon, Loader2, Radio, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RegionDrawCanvas } from "@/components/alerts/RegionDrawCanvas";
import { useUIStore } from "@/lib/store/useUIStore";
import { useCameraClasses, useCameraLocations, useCameraSnapshot } from "@/lib/hooks/useCameraLocations";
import { useCameras } from "@/lib/hooks/useCameras";
import { useCreateAlertRule } from "@/lib/hooks/useAlertRules";
import { liveEventImageUrl } from "@/lib/hooks/useCameraLiveFeed";
import { useSharedCameraStream } from "@/lib/webrtcStreamManager";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import {
  ABSENCE_THRESHOLD_OPTIONS,
  MIN_ABSENCE_THRESHOLD_SECONDS,
  formatAbsenceThreshold,
} from "@/lib/alertConditions";
import type { AlertBoundingBox, AlertCategory, CameraLocation } from "@/lib/types";
import { formatClassNames } from "@/lib/detectionClasses";
import { cn } from "@/lib/utils";

type TriggerMode = "enter" | "leave";
type AlertKind = "region" | "absence";

const ALERT_KIND_OPTIONS: { value: AlertKind; label: string }[] = [
  { value: "region", label: "Region Alert" },
  { value: "absence", label: "No Person Detected" },
];

const CATEGORY_OPTIONS: { value: AlertCategory; label: string; activeClass: string }[] = [
  {
    value: "critical",
    label: "High",
    activeClass: "border-severity-critical bg-severity-critical/15 text-severity-critical",
  },
  {
    value: "medium",
    label: "Medium",
    activeClass: "border-severity-medium bg-severity-medium/15 text-severity-medium",
  },
  {
    value: "low",
    label: "Low",
    activeClass: "border-severity-low bg-severity-low/15 text-severity-low",
  },
];

const DEFAULT_DETECTION_CLASSES = ["person", "car", "motorcycle", "bicycle", "bus", "truck"];

export function CreateAlertModal() {
  const isOpen = useUIStore((s) => s.isCreateAlertModalOpen);
  const setOpen = useUIStore((s) => s.setCreateAlertModalOpen);
  const prefilledCameraId = useUIStore((s) => s.selectedCameraId);

  const { data: registryCameras } = useCameraLocations();
  const { data: streamCameras } = useCameras();
  const createRule = useCreateAlertRule();

  const cameras = useMemo<CameraLocation[]>(() => {
    if (!streamCameras) return [];

    const registryById = new Map(
      (registryCameras ?? []).map((camera) => [camera.cameraId.toLowerCase(), camera])
    );

    return streamCameras
      .filter((camera) => camera.status === "online")
      .map((camera) => {
        const candidateIds = [
          resolveDetectionCameraId(camera.id),
          resolveDetectionCameraId(camera.code),
          resolveDetectionCameraId(camera.name),
          camera.sourceName ? resolveDetectionCameraId(camera.sourceName) : null,
        ]
          .filter(Boolean)
          .map((value) => String(value));

        const registryMatch = candidateIds
          .map((id) => registryById.get(id.toLowerCase()))
          .find(Boolean);
        if (registryMatch) return registryMatch;

        const cameraId = candidateIds[0] ?? camera.id;
        return {
          id: 0,
          cameraId,
          cameraName: camera.name || camera.code || cameraId,
          cameraIp: null,
          zone: camera.zoneName || null,
          scene: null,
          latitude: null,
          longitude: null,
          headingDegrees: null,
          address: null,
          building: null,
          floor: null,
          description: null,
          enabled: true,
          createdAt: null,
          updatedAt: null,
          isRegistered: false,
        };
      });
  }, [registryCameras, streamCameras]);

  const [alertKind, setAlertKind] = useState<AlertKind>("region");
  const [cameraId, setCameraId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AlertCategory | "">("");
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("enter");
  const [box, setBox] = useState<AlertBoundingBox | null>(null);
  const [absenceThreshold, setAbsenceThreshold] = useState(String(MIN_ABSENCE_THRESHOLD_SECONDS));
  const [selectedClasses, setSelectedClasses] = useState<string[]>(["person"]);
  const [feedMode, setFeedMode] = useState<"auto" | "webrtc" | "snapshot">("auto");
  const [streamDims, setStreamDims] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  const { data: snapshot, isLoading: snapshotLoading } = useCameraSnapshot(
    cameraId || null
  );

  const { data: cameraClasses, isLoading: cameraClassesLoading } = useCameraClasses(
    alertKind === "region" ? cameraId || null : null
  );

  const selectedCamera = cameras?.find((c) => c.cameraId === cameraId) ?? null;
  const streamCameraMatch = streamCameras?.find(
    (c) =>
      c.id.toLowerCase() === cameraId.toLowerCase() ||
      c.code.toLowerCase() === cameraId.toLowerCase() ||
      c.name.toLowerCase() === cameraId.toLowerCase()
  );
  const streamSourceName =
    streamCameraMatch?.sourceName ||
    streamCameraMatch?.name ||
    selectedCamera?.cameraName ||
    selectedCamera?.cameraId ||
    cameraId;

  // WebRTC Stream connection directly to MediaMTX
  const { stream: liveStream, status: liveStreamStatus } = useSharedCameraStream(
    isOpen && streamSourceName ? streamSourceName : ""
  );

  const availableClasses = useMemo(() => {
    if (cameraClasses?.classNames && cameraClasses.classNames.length > 0) {
      return cameraClasses.classNames;
    }
    return DEFAULT_DETECTION_CLASSES;
  }, [cameraClasses]);

  useEffect(() => {
    if (selectedClasses.length === 0) {
      setSelectedClasses(["person"]);
    }
  }, [cameraId, selectedClasses.length]);

  useEffect(() => {
    if (isOpen && prefilledCameraId && !cameraId && cameras) {
      const match = cameras.find(
        (c) => c.cameraId.toLowerCase() === prefilledCameraId.toLowerCase()
      );
      if (match) setCameraId(match.cameraId);
    }
  }, [isOpen, prefilledCameraId, cameras, cameraId]);

  // Determine whether to show live WebRTC stream or DB snapshot
  const activeFeedIsWebRTC =
    feedMode === "webrtc" ||
    (feedMode === "auto" && (!snapshot || liveStreamStatus === "connected"));

  const hasVisualFeed = Boolean(snapshot || liveStream || liveStreamStatus === "connecting");

  const canSave =
    alertKind === "absence"
      ? Boolean(cameraId && name.trim() && category && Number(absenceThreshold) > 0)
      : Boolean(
          cameraId &&
            name.trim() &&
            category &&
            box &&
            hasVisualFeed &&
            selectedClasses.length > 0
        );

  function resetForm() {
    setAlertKind("region");
    setCameraId("");
    setName("");
    setCategory("");
    setTriggerMode("enter");
    setBox(null);
    setAbsenceThreshold(String(MIN_ABSENCE_THRESHOLD_SECONDS));
    setSelectedClasses(["person"]);
    setFeedMode("auto");
  }

  function toggleClass(className: string) {
    setSelectedClasses((prev) =>
      prev.includes(className)
        ? prev.length > 1
          ? prev.filter((c) => c !== className)
          : prev
        : [...prev, className]
    );
  }

  async function handleSave() {
    if (!category || !cameraId) return;

    const refWidth = (!activeFeedIsWebRTC && snapshot?.imageWidth) ? snapshot.imageWidth : streamDims.width;
    const refHeight = (!activeFeedIsWebRTC && snapshot?.imageHeight) ? snapshot.imageHeight : streamDims.height;
    const sourceEvtId = (!activeFeedIsWebRTC && snapshot?.eventId) ? snapshot.eventId : undefined;

    if (alertKind === "absence") {
      await createRule.mutateAsync({
        kind: "absence",
        cameraId,
        zone: selectedCamera?.zone ?? undefined,
        name: name.trim(),
        label: "person",
        category,
        absenceThresholdSeconds: Number(absenceThreshold),
        ...(box
          ? {
              sourceEventId: sourceEvtId,
              boundingBox: box,
              refImageWidth: refWidth,
              refImageHeight: refHeight,
            }
          : {}),
      });
    } else {
      if (!box || selectedClasses.length === 0) return;
      await createRule.mutateAsync({
        cameraId,
        zone: selectedCamera?.zone ?? undefined,
        name: name.trim(),
        label: formatClassNames(selectedClasses),
        category,
        sourceEventId: sourceEvtId,
        boundingBox: box,
        triggerInside: triggerMode === "enter",
        triggerOutside: triggerMode === "leave",
        refImageWidth: refWidth,
        refImageHeight: refHeight,
        classNames: selectedClasses,
      });
    }
    resetForm();
    setOpen(false);
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent className="max-h-[88vh] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-white shadow-sm">
              <Bell className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle>
                {alertKind === "absence" ? "Create No-Person Alert" : "Create Region Alert"}
              </DialogTitle>
              <DialogDescription>
                {alertKind === "absence"
                  ? "Pick a camera and how long it must go without any person detected — the dashboard records an alert each time that window passes with the view still empty."
                  : "Draw a zone directly on the live WebRTC stream or latest snapshot — an alert fires when a target enters or leaves your zone."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Alert Type</Label>
          <div className="flex flex-wrap gap-2">
            {ALERT_KIND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setAlertKind(option.value);
                  setBox(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  alertKind === option.value
                    ? "border-primary bg-primary/15 text-primary shadow-sm"
                    : "border-surface-border text-muted-foreground hover:bg-surface-3"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Camera</Label>
          <Select
            value={cameraId}
            onValueChange={(value) => {
              setCameraId(value);
              setBox(null);
              setFeedMode("auto");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a camera" />
            </SelectTrigger>
            <SelectContent>
              {cameras?.map((camera) => (
                <SelectItem key={camera.cameraId} value={camera.cameraId}>
                  {camera.cameraName} {camera.zone ? `· ${camera.zone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {cameraId && alertKind === "region" && (
          <div className="space-y-1.5">
            <Label>
              Detect Classes <span className="text-destructive">*</span>
            </Label>
            {cameraClassesLoading && !cameraClasses && (
              <p className="text-xs text-muted-foreground">Checking detection classes…</p>
            )}
            <div className="flex flex-wrap gap-2">
              {availableClasses.map((className) => (
                <button
                  key={className}
                  type="button"
                  onClick={() => toggleClass(className)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    selectedClasses.includes(className)
                      ? "border-primary bg-primary/15 text-primary shadow-sm"
                      : "border-surface-border text-muted-foreground hover:bg-surface-3"
                  )}
                >
                  {className}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Fires when any selected class interacts with the drawn zone.
            </p>
          </div>
        )}

        {cameraId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                {alertKind === "absence" ? "Restricted Zone (optional)" : "Draw Alert Zone"}
              </Label>
              <div className="flex items-center gap-2">
                {liveStream && (
                  <button
                    type="button"
                    onClick={() => setFeedMode(activeFeedIsWebRTC && snapshot ? "snapshot" : "webrtc")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all shadow-sm",
                      activeFeedIsWebRTC
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        : "border-surface-border bg-surface-2 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Radio className={cn("size-3", activeFeedIsWebRTC ? "animate-pulse text-emerald-400" : "")} />
                    {activeFeedIsWebRTC ? "Live WebRTC Stream" : "Switch to Live WebRTC"}
                  </button>
                )}
                {snapshot && (
                  <button
                    type="button"
                    onClick={() => setFeedMode("snapshot")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                      !activeFeedIsWebRTC
                        ? "border-primary/50 bg-primary/10 text-primary shadow-sm"
                        : "border-surface-border bg-surface-2 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CameraIcon className="size-3" />
                    Latest Snapshot
                  </button>
                )}
              </div>
            </div>

            {/* Connecting state when no stream and no snapshot ready yet */}
            {snapshotLoading && !liveStream && (
              <div className="relative aspect-video w-full rounded-lg bg-surface-2 flex flex-col items-center justify-center gap-2 border border-surface-border">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Connecting to camera WebRTC stream / snapshot...</p>
              </div>
            )}

            {/* Visual Feed & Drawing Canvas */}
            {(liveStream || snapshot) && (
              <RegionDrawCanvas
                videoStream={activeFeedIsWebRTC ? liveStream : null}
                imageUrl={!activeFeedIsWebRTC && snapshot ? liveEventImageUrl(snapshot.eventId) : null}
                imageWidth={!activeFeedIsWebRTC && snapshot ? snapshot.imageWidth : streamDims.width}
                imageHeight={!activeFeedIsWebRTC && snapshot ? snapshot.imageHeight : streamDims.height}
                value={box}
                onChange={setBox}
                onDimensionsReady={(dims) => setStreamDims(dims)}
              />
            )}

            {!snapshotLoading && !snapshot && !liveStream && (
              <div className="rounded-lg border border-surface-border bg-surface-2 p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Connecting to WebRTC live feed for <span className="font-semibold text-foreground">{streamSourceName}</span>...
                </p>
                <div className="mt-2 flex justify-center">
                  <Loader2 className="size-4 animate-spin text-primary" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {alertKind === "absence"
                  ? box
                    ? "Only this area is monitored — a person seen elsewhere is ignored. Drag to redraw."
                    : "Drag on the live feed/snapshot to restrict monitoring to an area. Leave blank for whole camera."
                  : box
                  ? "Zone drawn. Drag again to adjust or redraw."
                  : "Click and drag directly on the camera view to draw the alert zone."}
              </span>
              {box && (
                <button
                  type="button"
                  onClick={() => setBox(null)}
                  className="text-[11px] text-destructive hover:underline"
                >
                  Clear Zone
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="alert-name">Alert Name</Label>
            <Input
              id="alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Restricted Zone — Entrance"
            />
          </div>

          {alertKind === "absence" ? (
            <div className="space-y-1.5">
              <Label>Alert If No Person For</Label>
              <Select value={absenceThreshold} onValueChange={setAbsenceThreshold}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_THRESHOLD_OPTIONS.map((seconds) => (
                    <SelectItem key={seconds} value={String(seconds)}>
                      {formatAbsenceThreshold(seconds)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Re-alerts every {formatAbsenceThreshold(Number(absenceThreshold))} while empty.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Trigger Condition</Label>
              <Select value={triggerMode} onValueChange={(v) => setTriggerMode(v as TriggerMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enter">Detected target enters zone</SelectItem>
                  <SelectItem value="leave">Target is outside zone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Alert Severity <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  category === option.value
                    ? option.activeClass
                    : "border-surface-border text-muted-foreground hover:bg-surface-3"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <p className="rounded-lg border border-surface-border bg-surface-2 p-3 text-xs text-muted-foreground">
          This rule is continuously evaluated against camera detection events and live feeds.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || createRule.isPending}
            className="gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold"
          >
            {createRule.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save Alert Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
