"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CameraLocationMapLoader } from "@/components/map/CameraLocationMapLoader";
import { CameraLocationPanel } from "@/components/map/CameraLocationPanel";
import type { CameraMarkerData } from "@/components/map/CameraLocationMap";
import {
  useCameraLocations,
  useCameraTotalPersonsLastHour,
  useCreateCameraLocation,
  useSyncCameras,
  useUpdateCameraLocation,
  useZoneSummaries,
} from "@/lib/hooks/useCameraLocations";
import { useCameras } from "@/lib/hooks/useCameras";
import { useLiveCameraOccupancy } from "@/lib/hooks/useLiveCameraOccupancy";
import { resolveDetectionCameraId } from "@/lib/streamToDetectionCameraId";
import { MAP_BOUNDS, MAP_MAX_ZOOM } from "@/components/map/mapStyles";
import type { CameraLocation, CameraStatus } from "@/lib/types";

const BOUNDARY_MARGIN = 0.02;

// Stable [0, 1) fraction derived only from the camera's own id — deliberately
// NOT based on the camera's index within the current unplaced list. Index-based
// placement reshuffles every other still-unplaced camera's position whenever
// the list's length changes (a camera gets auto-synced into the registry, a
// new stream camera appears, etc.), which looks like pins drifting on their
// own even though nobody touched the map.
function idFraction(cameraId: string): number {
  let hash = 0;
  for (let i = 0; i < cameraId.length; i++) hash = (hash * 31 + cameraId.charCodeAt(i)) >>> 0;
  return hash / 4294967295;
}

/**
 * Places a not-yet-placed camera along the west edge of the map's bounds
 * (Islamabad + Rawalpindi), at a spot fixed to its own id, so every camera
 * shows up as a draggable pin the moment it's discovered — the user just
 * drags each one to its real spot instead of having to hunt for an
 * invisible, coordinate-less entry first.
 */
function defaultBoundaryPosition(cameraId: string): [number, number] {
  const [[minLng, minLat], [, maxLat]] = MAP_BOUNDS;
  const longitude = minLng + BOUNDARY_MARGIN;
  const top = maxLat - BOUNDARY_MARGIN;
  const bottom = minLat + BOUNDARY_MARGIN;
  const latitude = bottom + (top - bottom) * idFraction(cameraId);
  return [longitude, latitude];
}

export default function MapViewPage() {
  const { data: registryCameras, isLoading, error } = useCameraLocations();
  const { data: streamCameras } = useCameras();
  const { data: zoneSummaries } = useZoneSummaries();
  const liveOccupancy = useLiveCameraOccupancy();
  const updateLocation = useUpdateCameraLocation();
  const createLocation = useCreateCameraLocation();
  const syncCameras = useSyncCameras();

  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [placementCameraId, setPlacementCameraId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ center: [number, number]; zoom: number } | null>(
    null
  );

  const registeredIds = useMemo(() => {
    const set = new Set<string>();
    (registryCameras ?? []).forEach((c) => set.add(c.cameraId.toLowerCase()));
    return set;
  }, [registryCameras]);

  // The registry (`camera_locations`) can hold rows for cameras that were
  // removed from the actual camera system later — sync/create only ever
  // adds rows, nothing here ever deletes one when a camera goes away. Only
  // show a registry row if that camera still exists in the live-stream
  // feed (the same source Cameras/Media Wall use), so a deleted camera
  // doesn't linger as a ghost pin here.
  const liveStreamIds = useMemo(() => {
    const set = new Set<string>();
    (streamCameras ?? []).forEach((c) => set.add(resolveDetectionCameraId(c.id).toLowerCase()));
    return set;
  }, [streamCameras]);

  const liveRegistryCameras = useMemo(() => {
    // Streams haven't loaded yet — don't filter against an empty set, or
    // every registry camera would briefly vanish on first paint.
    if (!streamCameras) return registryCameras ?? [];
    return (registryCameras ?? []).filter((c) => liveStreamIds.has(c.cameraId.toLowerCase()));
  }, [registryCameras, streamCameras, liveStreamIds]);

  // Cameras known from the live-stream feed that don't have a registry row
  // yet (no detection data for `sync` to pick up from). Shown alongside
  // registered cameras so every camera is visible at once — placing one on
  // the map registers it for the first time instead of updating it.
  const unregisteredCameras = useMemo<CameraLocation[]>(() => {
    if (!streamCameras) return [];
    const seen = new Set<string>();
    const candidates: { resolvedId: string; name: string; zone: string | null }[] = [];
    for (const camera of streamCameras) {
      const resolvedId = resolveDetectionCameraId(camera.id);
      const key = resolvedId.toLowerCase();
      if (registeredIds.has(key) || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ resolvedId, name: camera.name || resolvedId, zone: camera.zoneName || null });
    }
    // Sort by id (not API response order, which isn't guaranteed stable
    // between polls) purely so the "All Cameras" list below doesn't
    // reorder itself on every refresh.
    candidates.sort((a, b) => a.resolvedId.localeCompare(b.resolvedId));
    return candidates.map((candidate) => {
      const [longitude, latitude] = defaultBoundaryPosition(candidate.resolvedId);
      return {
        id: 0,
        cameraId: candidate.resolvedId,
        cameraName: candidate.name,
        cameraIp: null,
        zone: candidate.zone,
        scene: null,
        latitude,
        longitude,
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
  }, [streamCameras, registeredIds]);

  const cameras = useMemo(
    () => [...liveRegistryCameras, ...unregisteredCameras],
    [liveRegistryCameras, unregisteredCameras]
  );

  const { data: totalLastHour } = useCameraTotalPersonsLastHour(cameras);

  // Live status (from the same live-stream feed used above to drop stale
  // rows) plus live/last-hour person counts (from the detection websocket
  // and REST aggregate, respectively) for the marker hover tooltip.
  const streamStatusById = useMemo(() => {
    const map = new Map<string, CameraStatus>();
    (streamCameras ?? []).forEach((c) => {
      map.set(resolveDetectionCameraId(c.id).toLowerCase(), c.status);
    });
    return map;
  }, [streamCameras]);

  const camerasForMap = useMemo<CameraMarkerData[]>(() => {
    return cameras.map((camera) => {
      const total = totalLastHour?.find((d) => d.cameraId === camera.cameraId);
      return {
        ...camera,
        status: streamStatusById.get(camera.cameraId.toLowerCase()) ?? "offline",
        livePeopleCount: liveOccupancy[camera.cameraId]?.peopleCount ?? 0,
        lastHourPeopleCount: total?.totalPeopleCount ?? null,
      };
    });
  }, [cameras, streamStatusById, liveOccupancy, totalLastHour]);

  const selectedCamera = useMemo(
    () => cameras.find((c) => c.cameraId === selectedCameraId) ?? null,
    [cameras, selectedCameraId]
  );

  function handleSelectCamera(cameraId: string) {
    setSelectedCameraId(cameraId);
    setPlacementCameraId(null);
    const camera = cameras.find((c) => c.cameraId === cameraId);
    if (camera?.latitude !== null && camera?.longitude !== null && camera) {
      setFlyToTarget({
        center: [camera.longitude as number, camera.latitude as number],
        zoom: MAP_MAX_ZOOM,
      });
    }
  }

  function persistLocation(cameraId: string, latitude: number, longitude: number) {
    if (registeredIds.has(cameraId.toLowerCase())) {
      updateLocation.mutate({ cameraId, latitude, longitude });
    } else {
      const camera = unregisteredCameras.find((c) => c.cameraId === cameraId);
      createLocation.mutate({
        cameraId,
        cameraName: camera?.cameraName,
        zone: camera?.zone,
        latitude,
        longitude,
      });
    }
    setPlacementCameraId(null);
  }

  return (
    <div className="flex h-[calc(100vh-4rem-2.25rem)] flex-col">
      <PageHeader
        title="Map View"
        description="Live camera locations from the detection API — drag a marker, click Pick on map, or type coordinates to relocate a camera"
        actions={
          <div className="flex items-center gap-2">
            {syncCameras.isSuccess && (
              <span className="text-xs text-muted-foreground">
                {syncCameras.data.added > 0
                  ? `Added ${syncCameras.data.added} new camera${syncCameras.data.added === 1 ? "" : "s"}`
                  : "No new cameras found"}
              </span>
            )}
            {syncCameras.isError && (
              <span className="text-xs text-destructive">{syncCameras.error.message}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={syncCameras.isPending}
              onClick={() => syncCameras.mutate()}
            >
              <RefreshCw className={`size-3.5 ${syncCameras.isPending ? "animate-spin" : ""}`} />
              {syncCameras.isPending ? "Syncing…" : "Sync new cameras"}
            </Button>
          </div>
        }
      />
      {error && (
        <div className="mx-4 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive sm:mx-6">
          {error.message}
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_340px]">
        <div className="h-[480px] min-h-0 overflow-hidden rounded-xl border border-surface-border lg:h-full">
          <CameraLocationMapLoader
            cameras={camerasForMap}
            selectedCameraId={selectedCameraId}
            onSelectCamera={handleSelectCamera}
            onDragEnd={persistLocation}
            placementCameraId={placementCameraId}
            onPickLocation={(latitude, longitude) => {
              if (placementCameraId) persistLocation(placementCameraId, latitude, longitude);
            }}
            flyToTarget={flyToTarget}
          />
        </div>
        <div className="h-[420px] min-h-0 overflow-hidden rounded-xl border border-surface-border lg:h-full">
          <CameraLocationPanel
            zoneSummaries={zoneSummaries ?? []}
            cameras={cameras}
            selectedCamera={selectedCamera}
            placementCameraId={placementCameraId}
            onArmPlacement={setPlacementCameraId}
            onCancelPlacement={() => setPlacementCameraId(null)}
            onSave={persistLocation}
            onClose={() => setSelectedCameraId(null)}
            onSelectCamera={handleSelectCamera}
            isSaving={updateLocation.isPending || createLocation.isPending}
            saveError={updateLocation.error?.message ?? createLocation.error?.message ?? null}
          />
        </div>
      </div>
      {isLoading && !registryCameras && (
        <div className="px-4 pb-4 text-xs text-muted-foreground sm:px-6">
          Loading camera registry…
        </div>
      )}
    </div>
  );
}
