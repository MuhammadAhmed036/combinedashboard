"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
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

export function CreateAlertModal() {
  const isOpen = useUIStore((s) => s.isCreateAlertModalOpen);
  const setOpen = useUIStore((s) => s.setCreateAlertModalOpen);
  const prefilledCameraId = useUIStore((s) => s.selectedCameraId);

  const { data: registryCameras } = useCameraLocations();
  // Same live-stream API the Cameras page uses — a camera only belongs in
  // this dropdown while it's actually online, so alerts can never be
  // created against an offline or since-removed camera.
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

  // Fetched for both kinds: region rules require it, and absence rules use
  // it only to offer an OPTIONAL restricted-zone drawing step — a camera
  // with no recent recorded events just won't get that option (handled as
  // a soft, non-blocking message below, not a hard requirement).
  const { data: snapshot, isLoading: snapshotLoading, error: snapshotError } = useCameraSnapshot(
    cameraId || null
  );
  // Drives the class picker below — whatever the model actually reports for
  // this camera, not a fixed list, so a new class shows up automatically.
  const { data: cameraClasses } = useCameraClasses(alertKind === "region" ? cameraId || null : null);

  useEffect(() => {
    // Once this camera's real class list loads, default to "person" if it's
    // among them and nothing is selected yet — preserves the old behavior
    // for anyone who doesn't touch the picker, without hardcoding it.
    if (alertKind !== "region" || !cameraClasses || selectedClasses.length > 0) return;
    if (cameraClasses.classNames.includes("person")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds the default selection once this camera's class list has loaded.
      setSelectedClasses(["person"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraClasses, alertKind]);

  useEffect(() => {
    if (isOpen && prefilledCameraId && !cameraId && cameras) {
      const match = cameras.find(
        (c) => c.cameraId.toLowerCase() === prefilledCameraId.toLowerCase()
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-fills the form only when the dialog opens from a camera context.
      if (match) setCameraId(match.cameraId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefilledCameraId, cameras]);

  const selectedCamera = cameras?.find((c) => c.cameraId === cameraId) ?? null;
  const canSave =
    alertKind === "absence"
      ? Boolean(cameraId && name.trim() && category && Number(absenceThreshold) > 0)
      : Boolean(cameraId && name.trim() && category && box && snapshot && selectedClasses.length > 0);

  function resetForm() {
    setAlertKind("region");
    setCameraId("");
    setName("");
    setCategory("");
    setTriggerMode("enter");
    setBox(null);
    setAbsenceThreshold(String(MIN_ABSENCE_THRESHOLD_SECONDS));
    setSelectedClasses(["person"]);
  }

  function toggleClass(className: string) {
    setSelectedClasses((prev) =>
      prev.includes(className) ? prev.filter((c) => c !== className) : [...prev, className]
    );
  }

  async function handleSave() {
    if (!category) return;
    if (alertKind === "absence") {
      await createRule.mutateAsync({
        kind: "absence",
        cameraId,
        zone: selectedCamera?.zone ?? undefined,
        name: name.trim(),
        label: "person",
        category,
        absenceThresholdSeconds: Number(absenceThreshold),
        // Restricted zone is optional for this kind — only attach box/ref
        // fields when the user actually drew one on a loaded snapshot.
        ...(box && snapshot
          ? {
              sourceEventId: snapshot.eventId,
              boundingBox: box,
              refImageWidth: snapshot.imageWidth,
              refImageHeight: snapshot.imageHeight,
            }
          : {}),
      });
    } else {
      if (!snapshot || !box || selectedClasses.length === 0) return;
      await createRule.mutateAsync({
        cameraId,
        zone: selectedCamera?.zone ?? undefined,
        name: name.trim(),
        label: formatClassNames(selectedClasses),
        category,
        sourceEventId: snapshot.eventId,
        boundingBox: box,
        triggerInside: triggerMode === "enter",
        triggerOutside: triggerMode === "leave",
        refImageWidth: snapshot.imageWidth,
        refImageHeight: snapshot.imageHeight,
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
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Bell className="size-5 text-white" />
            </div>
            <div>
              <DialogTitle>
                {alertKind === "absence" ? "Create No-Person Alert" : "Create Region Alert"}
              </DialogTitle>
              <DialogDescription>
                {alertKind === "absence"
                  ? "Pick a camera and how long it must go without any person detected — the dashboard records an alert each time that window passes with the view still empty."
                  : "Draw a zone on the camera's latest snapshot — an alert fires when a person's bounding box matches your trigger condition."}
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
                    ? "border-primary bg-primary/15 text-primary"
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
              // Reset the picker — the new camera's own class list re-seeds
              // it (defaulting to "person" if available) via the effect above.
              setSelectedClasses([]);
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
              Detect <span className="text-destructive">*</span>
            </Label>
            {!cameraClasses && (
              <p className="text-xs text-muted-foreground">Checking what this camera detects…</p>
            )}
            {cameraClasses && cameraClasses.classNames.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No recent detections for this camera yet — the class list will appear once it
                reports some.
              </p>
            )}
            {cameraClasses && cameraClasses.classNames.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {/* Built from this camera's own recent detections, not a fixed
                      list — a class the model has never reported here won't show
                      up, and a brand-new one appears automatically once it does. */}
                  {cameraClasses.classNames.map((className) => (
                    <button
                      key={className}
                      type="button"
                      onClick={() => toggleClass(className)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                        selectedClasses.includes(className)
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-surface-border text-muted-foreground hover:bg-surface-3"
                      )}
                    >
                      {className}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Fires if any selected class enters the drawn zone — pick as many as you need.
                </p>
              </>
            )}
          </div>
        )}

        {cameraId && (
          <div className="space-y-1.5">
            <Label>
              {alertKind === "absence" ? "Restricted Zone (optional)" : "Draw Alert Zone"}
            </Label>
            {snapshotLoading && <Skeleton className="aspect-video w-full rounded-lg" />}
            {/* Covers both an actual fetch error AND a successful-but-empty
                response (a camera with no recorded events yet) — without
                this, a camera that's simply new/idle shows nothing at all
                instead of an explanation, since a query that resolves to
                `null` data has no `error` to key off of. */}
            {!snapshotLoading &&
              !snapshot &&
              (alertKind === "absence" ? (
                <p className="text-xs text-muted-foreground">
                  No snapshot available yet for this camera, so a restricted zone can&apos;t be
                  drawn right now — the alert will monitor the whole camera view instead. You can
                  still save it as-is.
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  {snapshotError
                    ? "Could not load a snapshot for this camera — please try again."
                    : "No snapshot available yet for this camera — it may not have any recorded events yet."}
                </p>
              ))}
            {snapshot && (
              <RegionDrawCanvas
                imageUrl={liveEventImageUrl(snapshot.eventId)}
                imageWidth={snapshot.imageWidth}
                imageHeight={snapshot.imageHeight}
                value={box}
                onChange={setBox}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {alertKind === "absence"
                ? box
                  ? "Only this area is monitored — a person seen anywhere else in frame is ignored. Draw again to redo it, or leave it as-is to monitor the whole view."
                  : "Click and drag on the image to require a person stay in a specific area. Leave it blank to monitor the whole camera view instead."
                : "Click and drag on the image to draw the zone. Draw again to redo it."}
            </p>
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
                Re-alerts every {formatAbsenceThreshold(Number(absenceThreshold))} while the view
                stays empty.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Trigger When</Label>
              <Select value={triggerMode} onValueChange={(v) => setTriggerMode(v as TriggerMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enter">Person enters this zone</SelectItem>
                  <SelectItem value="leave">Person is outside this zone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Alert Category <span className="text-destructive">*</span>
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
          <p className="text-xs text-muted-foreground">Required — choose how severe this alert is.</p>
        </div>

        <p className="rounded-lg border border-surface-border bg-surface-2 p-3 text-xs text-muted-foreground">
          This rule is saved to the detection backend and continuously checked by this dashboard
          while it&apos;s open in a browser (via the camera&apos;s live feed). For guaranteed
          always-on detection even when no browser is open, this same check should also be
          implemented in the C++/NATS detection worker.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || createRule.isPending}
            className="gap-1.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90"
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

