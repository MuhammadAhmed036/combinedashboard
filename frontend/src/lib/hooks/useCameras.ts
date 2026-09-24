"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRuntimeConfig } from "@/lib/hooks/useRuntimeConfig";
import { DEFAULT_POLL_INTERVAL_MS } from "@/lib/runtimeConfig";
import type { Camera } from "@/lib/types";

async function cameraFetcher(url: string): Promise<Camera[]> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as Camera[] | { error?: string };
  if (!response.ok) {
    const message = Array.isArray(payload) ? undefined : payload.error;
    throw new Error(message || `Camera API returned ${response.status}`);
  }
  if (!Array.isArray(payload)) throw new Error("Camera API returned an invalid response");
  return payload;
}

/**
 * Debounces online→offline transitions so a single missed poll doesn't
 * flash a camera offline and back online every few seconds. A camera only
 * gets shown as offline once it's been continuously reported offline for
 * offlineGraceMs — if it reconnects before that, the UI never visibly
 * changed. A camera that's never been seen online (e.g. genuinely down on
 * first load) still shows offline immediately — there's nothing to debounce.
 */
function useStableCameraStatus(
  cameras: Camera[] | undefined,
  offlineGraceMs: number
): Camera[] | undefined {
  const [displayOffline, setDisplayOffline] = useState<Set<string>>(new Set());
  const everOnlineRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Read via ref inside the pending setTimeout below rather than as an effect
  // dependency — otherwise every in-flight offline-grace timer would be torn
  // down and restarted the instant runtime config resolves post-mount.
  const graceRef = useRef(offlineGraceMs);
  useEffect(() => {
    graceRef.current = offlineGraceMs;
  }, [offlineGraceMs]);

  useEffect(() => {
    if (!cameras) return;

    cameras.forEach((camera) => {
      const pendingTimer = timersRef.current.get(camera.id);

      if (camera.status === "online") {
        everOnlineRef.current.add(camera.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          timersRef.current.delete(camera.id);
        }
        setDisplayOffline((prev) => {
          if (!prev.has(camera.id)) return prev;
          const next = new Set(prev);
          next.delete(camera.id);
          return next;
        });
        return;
      }

      if (!everOnlineRef.current.has(camera.id)) {
        setDisplayOffline((prev) => (prev.has(camera.id) ? prev : new Set(prev).add(camera.id)));
        return;
      }

      if (!pendingTimer) {
        const timer = setTimeout(() => {
          timersRef.current.delete(camera.id);
          setDisplayOffline((prev) => new Set(prev).add(camera.id));
        }, graceRef.current);
        timersRef.current.set(camera.id, timer);
      }
    });

    const currentIds = new Set(cameras.map((c) => c.id));
    timersRef.current.forEach((timer, id) => {
      if (!currentIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });
  }, [cameras]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return useMemo(() => {
    if (!cameras) return cameras;
    return cameras.map((camera) =>
      displayOffline.has(camera.id) ? { ...camera, status: "offline" as const } : { ...camera, status: "online" as const }
    );
  }, [cameras, displayOffline]);
}

export function useCameras() {
  const refreshInterval = useRuntimeConfig()?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // Wait a bit longer than one poll cycle before trusting an "offline"
  // report, so a transient blip has a real chance to be contradicted by the
  // next poll.
  const offlineGraceMs = refreshInterval + 2000;
  const swr = useSWR<Camera[], Error>("/api/stream-cameras", cameraFetcher, {
    refreshInterval,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });
  const stableData = useStableCameraStatus(swr.data, offlineGraceMs);
  return { ...swr, data: stableData };
}

export function useCamerasByZone(zoneId: string | null) {
  const query = useCameras();
  const data = useMemo(
    () => (zoneId ? query.data?.filter((camera) => camera.zoneId === zoneId) : undefined),
    [query.data, zoneId]
  );
  return { ...query, data };
}

export function useCamera(id: string | null) {
  const query = useCameras();
  const decodedId = useMemo(() => {
    if (!id) return null;
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }, [id]);
  const data = useMemo(
    () =>
      decodedId
        ? query.data?.find(
            (camera) =>
              camera.id === decodedId ||
              camera.sourceName === decodedId ||
              camera.code === decodedId
          )
        : undefined,
    [query.data, decodedId]
  );
  return { ...query, data };
}
