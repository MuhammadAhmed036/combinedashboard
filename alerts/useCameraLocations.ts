import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntimeConfig } from "@/lib/hooks/useRuntimeConfig";
import { DEFAULT_POLL_INTERVAL_MS } from "@/lib/runtimeConfig";
import {
  createCameraLocation,
  fetchAggregatePeopleCountSeries,
  fetchCameraClasses,
  fetchCameraLocation,
  fetchCameraLocations,
  fetchCameraPeopleCountSeries,
  fetchLatestCameraSnapshot,
  fetchZoneSummaries,
  syncCameras,
  updateCameraLocation,
} from "@/lib/services/cameraLocationsService";
import type { CameraLocation } from "@/lib/types";

export function useCameraLocations() {
  const refetchInterval = useRuntimeConfig()?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  return useQuery({
    queryKey: ["camera-locations"],
    queryFn: fetchCameraLocations,
    refetchInterval,
  });
}

export function useCameraLocation(cameraId: string | null) {
  const refetchInterval = useRuntimeConfig()?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  return useQuery({
    queryKey: ["camera-locations", "detail", cameraId],
    queryFn: () => fetchCameraLocation(cameraId as string),
    enabled: Boolean(cameraId),
    refetchInterval,
  });
}

export function useZoneSummaries() {
  return useQuery({ queryKey: ["zone-summaries"], queryFn: fetchZoneSummaries });
}

/** Which detection classes a camera has actually reported recently — informs the alert-creation class picker. */
export function useCameraClasses(cameraId: string | null) {
  return useQuery({
    queryKey: ["camera-classes", cameraId],
    queryFn: () => fetchCameraClasses(cameraId as string),
    enabled: Boolean(cameraId),
  });
}

export function useCameraSnapshot(cameraId: string | null) {
  return useQuery({
    queryKey: ["camera-snapshot", cameraId],
    queryFn: () => fetchLatestCameraSnapshot(cameraId as string),
    enabled: Boolean(cameraId),
  });
}

const SERIES_WINDOW_HOURS = 2;

export function useCameraPeopleCountSeries(cameraId: string | null) {
  return useQuery({
    queryKey: ["camera-people-count-series", cameraId],
    queryFn: () => {
      const toTs = new Date();
      const fromTs = new Date(toTs.getTime() - SERIES_WINDOW_HOURS * 3_600_000);
      return fetchCameraPeopleCountSeries(cameraId as string, {
        fromTs: fromTs.toISOString(),
        toTs: toTs.toISOString(),
        bucket: "5m",
        mode: "max",
      });
    },
    enabled: Boolean(cameraId),
    refetchInterval: 30_000,
  });
}

/**
 * Fires one request per camera in parallel. The backend's per-camera
 * people-count-series query currently takes several seconds to tens of
 * seconds on this deployment (large `detection_events` table, likely a
 * missing/unused index on `camera_id`) — so this is deliberately opt-in
 * (`enabled`) rather than fetched automatically on page load, and refreshes
 * slowly once loaded so it doesn't repeatedly hammer a known-slow backend.
 */
export function useAggregatePeopleCountSeries(cameraIds: string[], enabled = true) {
  const sortedIds = [...cameraIds].sort();
  return useQuery({
    queryKey: ["aggregate-people-count-series", sortedIds],
    queryFn: () => {
      const toTs = new Date();
      const fromTs = new Date(toTs.getTime() - SERIES_WINDOW_HOURS * 3_600_000);
      return fetchAggregatePeopleCountSeries(sortedIds, {
        fromTs: fromTs.toISOString(),
        toTs: toTs.toISOString(),
        bucket: "5m",
        mode: "max",
      });
    },
    enabled: enabled && sortedIds.length > 0,
    refetchInterval: 300_000,
  });
}

export interface CameraDensityWindow {
  cameraId: string;
  cameraName: string;
  peopleCount: number;
}

/**
 * Peak (max) live person count per camera over the last hour — answers
 * "which camera ran highest/lowest density in the last hour", as opposed to
 * `useLiveCameraOccupancy`, which only reflects the current instant.
 *
 * Also fires one (currently slow, see `useAggregatePeopleCountSeries`)
 * request per camera in parallel, so this is opt-in via `enabled` too.
 */
export function useCameraDensityLastHour(cameras: CameraLocation[] | undefined, enabled = true) {
  const cameraIds = [...(cameras?.map((c) => c.cameraId) ?? [])].sort();
  return useQuery({
    queryKey: ["camera-density-last-hour", cameraIds],
    queryFn: async (): Promise<CameraDensityWindow[]> => {
      const toTs = new Date();
      const fromTs = new Date(toTs.getTime() - 3_600_000);
      const results = await Promise.all(
        cameraIds.map(async (cameraId) => {
          const series = await fetchCameraPeopleCountSeries(cameraId, {
            fromTs: fromTs.toISOString(),
            toTs: toTs.toISOString(),
            bucket: "5m",
            mode: "max",
          }).catch(() => []);
          const peakCount = series.reduce((max, point) => Math.max(max, point.peopleCount), 0);
          const cameraName = cameras?.find((c) => c.cameraId === cameraId)?.cameraName ?? cameraId;
          return { cameraId, cameraName, peopleCount: peakCount };
        })
      );
      return results;
    },
    enabled: enabled && cameraIds.length > 0,
    refetchInterval: 300_000,
  });
}

export interface CameraTotalWindow {
  cameraId: string;
  cameraName: string;
  totalPeopleCount: number;
}

/**
 * Total person-count readings per camera, summed across the last hour —
 * answers "how many people were detected in total over the last hour", as
 * opposed to `useCameraDensityLastHour`, which reports the single highest
 * (peak) reading in that window. Used by the map hover tooltip's "Previous
 * 1 Hour Count" — kept as its own hook/query-key rather than a mode flag on
 * `useCameraDensityLastHour` so the Analytics page's "Peak" chart can never
 * be accidentally affected by a change made for the map tooltip.
 *
 * Same one-request-per-camera shape as `useCameraDensityLastHour` (see its
 * doc comment) — opt-in via `enabled` for the same reason.
 */
export function useCameraTotalPersonsLastHour(
  cameras: CameraLocation[] | undefined,
  enabled = true
) {
  const cameraIds = [...(cameras?.map((c) => c.cameraId) ?? [])].sort();
  return useQuery({
    queryKey: ["camera-total-persons-last-hour", cameraIds],
    queryFn: async (): Promise<CameraTotalWindow[]> => {
      const toTs = new Date();
      const fromTs = new Date(toTs.getTime() - 3_600_000);
      const results = await Promise.all(
        cameraIds.map(async (cameraId) => {
          const series = await fetchCameraPeopleCountSeries(cameraId, {
            fromTs: fromTs.toISOString(),
            toTs: toTs.toISOString(),
            bucket: "5m",
            mode: "max",
          }).catch(() => []);
          const totalCount = series.reduce((sum, point) => sum + point.peopleCount, 0);
          const cameraName = cameras?.find((c) => c.cameraId === cameraId)?.cameraName ?? cameraId;
          return { cameraId, cameraName, totalPeopleCount: totalCount };
        })
      );
      return results;
    },
    enabled: enabled && cameraIds.length > 0,
    refetchInterval: 300_000,
  });
}

export function useSyncCameras() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncCameras,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-locations"] });
      queryClient.invalidateQueries({ queryKey: ["zone-summaries"] });
    },
  });
}

const AUTO_SYNC_MS = 120_000;

/**
 * Runs the same upsert as the manual "Sync new cameras" button on a
 * background timer, so a camera that starts sending detections gets pulled
 * into the registry (and becomes selectable for alerts) without anyone
 * having to click the button. Silent by design — no UI, best-effort.
 */
export function useAutoSyncCameras() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const result = await syncCameras();
        if (!cancelled && result.added > 0) {
          queryClient.invalidateQueries({ queryKey: ["camera-locations"] });
          queryClient.invalidateQueries({ queryKey: ["zone-summaries"] });
        }
      } catch {
        // Best-effort — the next tick retries.
      }
    }

    run();
    const interval = setInterval(run, AUTO_SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [queryClient]);
}

export function useCreateCameraLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCameraLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-locations"] });
      queryClient.invalidateQueries({ queryKey: ["zone-summaries"] });
    },
  });
}

export function useUpdateCameraLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { cameraId: string; latitude: number; longitude: number }) =>
      updateCameraLocation(variables.cameraId, {
        latitude: variables.latitude,
        longitude: variables.longitude,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["camera-locations"] });
      queryClient.invalidateQueries({ queryKey: ["zone-summaries"] });
    },
  });
}
