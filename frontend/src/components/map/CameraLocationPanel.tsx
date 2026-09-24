"use client";

import { useState } from "react";
import { Crosshair, MapPin, MapPinOff, X } from "lucide-react";
import type { CameraLocation, ZoneSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zoneColor } from "@/components/map/CameraLocationMap";
import { useCameraLiveFeed } from "@/lib/hooks/useCameraLiveFeed";
import { DetectionFrameImage } from "@/components/alerts/DetectionFrameImage";
import { cn } from "@/lib/utils";

function formatDetectionTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function CameraLivePreview({ cameraId }: { cameraId: string }) {
  const feed = useCameraLiveFeed(cameraId);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-surface-border bg-black">
        {feed.latestEventId ? (
          <DetectionFrameImage
            key={feed.latestEventId}
            eventId={feed.latestEventId}
            alt="Latest detection frame"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Waiting for live frame…
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
          <span
            className={cn(
              "size-1.5 rounded-full",
              feed.connected ? "animate-pulse bg-red-500" : "bg-gray-400"
            )}
          />
          {feed.connected ? "Live" : "Connecting…"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-surface-border bg-surface-2 px-2.5 py-2">
          <div className="text-muted-foreground">People Count</div>
          <div className="mt-0.5 text-sm font-semibold">{feed.peopleCount ?? "—"}</div>
        </div>
        <div className="rounded-md border border-surface-border bg-surface-2 px-2.5 py-2">
          <div className="text-muted-foreground">Last Detection</div>
          <div className="mt-0.5 text-sm font-semibold">
            {formatDetectionTime(feed.lastDetectionTime)}
          </div>
        </div>
      </div>
      {feed.error && <p className="text-xs text-destructive">{feed.error}</p>}
    </div>
  );
}

function ZoneSummaryList({
  zoneSummaries,
  cameras,
  onSelectCamera,
}: {
  zoneSummaries: ZoneSummary[];
  cameras: CameraLocation[];
  onSelectCamera: (cameraId: string) => void;
}) {
  const unplaced = cameras.filter((c) => c.latitude === null || c.longitude === null).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-surface-border p-3">
        <h3 className="text-sm font-semibold">Camera Zones</h3>
        <p className="text-xs text-muted-foreground">
          {zoneSummaries.length} zones · {cameras.length} cameras total
        </p>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {zoneSummaries.map((zone) => (
          <div
            key={zone.zone}
            className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface-2 px-3 py-2.5"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: zoneColor(zone.zone) }}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{zone.zone}</div>
              <div className="text-xs text-muted-foreground">
                {zone.cameraCount} cameras · {zone.withCoords} placed
              </div>
            </div>
            {zone.enabledCount < zone.cameraCount && (
              <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                {zone.cameraCount - zone.enabledCount} disabled
              </span>
            )}
          </div>
        ))}
        {unplaced > 0 && (
          <p className="rounded-lg border border-dashed border-surface-border p-3 text-xs text-muted-foreground">
            {unplaced} camera{unplaced === 1 ? "" : "s"} have no coordinates yet — select one from
            the list below to place it.
          </p>
        )}
        <div className="space-y-1 pt-1">
          <div className="px-1 text-[11px] font-medium text-muted-foreground">
            All Cameras — click to open (works even if pins overlap on the map)
          </div>
          {cameras.map((camera) => (
            <button
              key={camera.cameraId}
              onClick={() => onSelectCamera(camera.cameraId)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-3"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: zoneColor(camera.zone) }}
                />
                <span className="truncate">{camera.cameraName}</span>
                {!camera.isRegistered && (
                  <span className="shrink-0 rounded-full bg-severity-medium/15 px-1.5 py-0.5 text-[10px] font-medium text-severity-medium">
                    New
                  </span>
                )}
              </span>
              {camera.latitude === null ? (
                <MapPinOff className="size-3.5 shrink-0 text-severity-medium" />
              ) : (
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CameraLocationPanel({
  zoneSummaries,
  cameras,
  selectedCamera,
  placementCameraId,
  onArmPlacement,
  onCancelPlacement,
  onSave,
  onClose,
  onSelectCamera,
  isSaving,
  saveError,
}: {
  zoneSummaries: ZoneSummary[];
  cameras: CameraLocation[];
  selectedCamera: CameraLocation | null;
  placementCameraId: string | null;
  onArmPlacement: (cameraId: string) => void;
  onCancelPlacement: () => void;
  onSave: (cameraId: string, latitude: number, longitude: number) => void;
  onClose: () => void;
  onSelectCamera: (cameraId: string) => void;
  isSaving: boolean;
  saveError: string | null;
}) {
  if (!selectedCamera) {
    return (
      <ZoneSummaryList zoneSummaries={zoneSummaries} cameras={cameras} onSelectCamera={onSelectCamera} />
    );
  }

  return (
    <CameraDetailForm
      // Remount only when the selected camera itself changes — the live
      // preview below shouldn't reconnect its WebSocket every time a
      // coordinate save updates this camera's lat/lng.
      key={selectedCamera.cameraId}
      camera={selectedCamera}
      placementCameraId={placementCameraId}
      onArmPlacement={onArmPlacement}
      onCancelPlacement={onCancelPlacement}
      onSave={onSave}
      onClose={onClose}
      isSaving={isSaving}
      saveError={saveError}
    />
  );
}

function CameraDetailForm({
  camera: selectedCamera,
  placementCameraId,
  onArmPlacement,
  onCancelPlacement,
  onSave,
  onClose,
  isSaving,
  saveError,
}: {
  camera: CameraLocation;
  placementCameraId: string | null;
  onArmPlacement: (cameraId: string) => void;
  onCancelPlacement: () => void;
  onSave: (cameraId: string, latitude: number, longitude: number) => void;
  onClose: () => void;
  isSaving: boolean;
  saveError: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-surface-border p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: zoneColor(selectedCamera.zone) }}
            />
            <h3 className="truncate text-sm font-semibold">{selectedCamera.cameraName}</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selectedCamera.zone ?? "No zone"} {selectedCamera.scene ? `· ${selectedCamera.scene}` : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <CameraLivePreview cameraId={selectedCamera.cameraId} />

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Camera ID</span>
            <span className="font-mono text-foreground">{selectedCamera.cameraId}</span>
          </div>
          {selectedCamera.cameraIp && (
            <div className="flex justify-between">
              <span>IP</span>
              <span className="font-mono text-foreground">{selectedCamera.cameraIp}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Status</span>
            <span className={selectedCamera.enabled ? "text-status-active" : "text-destructive"}>
              {selectedCamera.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          {(selectedCamera.building || selectedCamera.floor || selectedCamera.address) && (
            <div className="flex justify-between">
              <span>Location</span>
              <span className="text-right text-foreground">
                {[selectedCamera.building, selectedCamera.floor, selectedCamera.address]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
        </div>

        <CoordinateEditor
          // Remount only this small editor when the saved coordinates
          // change (e.g. after a drag/pick-on-map persists), so its inputs
          // stay in sync without a state-sync effect — and without
          // disturbing the live preview above.
          key={`${selectedCamera.latitude}-${selectedCamera.longitude}`}
          camera={selectedCamera}
          placementCameraId={placementCameraId}
          onArmPlacement={onArmPlacement}
          onCancelPlacement={onCancelPlacement}
          onSave={onSave}
          isSaving={isSaving}
          saveError={saveError}
        />
      </div>
    </div>
  );
}

function CoordinateEditor({
  camera: selectedCamera,
  placementCameraId,
  onArmPlacement,
  onCancelPlacement,
  onSave,
  isSaving,
  saveError,
}: {
  camera: CameraLocation;
  placementCameraId: string | null;
  onArmPlacement: (cameraId: string) => void;
  onCancelPlacement: () => void;
  onSave: (cameraId: string, latitude: number, longitude: number) => void;
  isSaving: boolean;
  saveError: string | null;
}) {
  const [latInput, setLatInput] = useState(selectedCamera.latitude?.toString() ?? "");
  const [lngInput, setLngInput] = useState(selectedCamera.longitude?.toString() ?? "");

  const isPlacing = placementCameraId === selectedCamera.cameraId;
  const lat = Number(latInput);
  const lng = Number(lngInput);
  const canSave =
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  return (
    <div className="space-y-3 rounded-lg border border-surface-border bg-surface-2 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">Coordinates</div>
        <Button
          size="sm"
          variant={isPlacing ? "default" : "outline"}
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => (isPlacing ? onCancelPlacement() : onArmPlacement(selectedCamera.cameraId))}
        >
          <Crosshair className="size-3.5" />
          {isPlacing ? "Cancel" : "Pick on map"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="camera-lat" className="text-[11px]">
            Latitude
          </Label>
          <Input
            id="camera-lat"
            inputMode="decimal"
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="camera-lng" className="text-[11px]">
            Longitude
          </Label>
          <Input
            id="camera-lng"
            inputMode="decimal"
            value={lngInput}
            onChange={(e) => setLngInput(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      <Button
        size="sm"
        className="w-full gap-1.5"
        disabled={!canSave || isSaving}
        onClick={() => onSave(selectedCamera.cameraId, lat, lng)}
      >
        <MapPin className="size-3.5" />
        {isSaving ? "Saving…" : "Save Location"}
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Drag the marker on the map, click &quot;Pick on map&quot;, or type coordinates directly. Saving
        persists to the camera registry via the backend API.
      </p>
    </div>
  );
}
