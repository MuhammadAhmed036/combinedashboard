"use client";

import { useEffect, useState } from "react";
import { subscribeToAllCamerasFeed } from "@/lib/allCamerasFeed";

export interface CameraLiveFeedState {
  connected: boolean;
  cameraName: string | null;
  zone: string | null;
  scene: string | null;
  latestEventId: string | null;
  peopleCount: number | null;
  lastDetectionTime: string | null;
  error: string | null;
}

const INITIAL_STATE: CameraLiveFeedState = {
  connected: false,
  cameraName: null,
  zone: null,
  scene: null,
  latestEventId: null,
  peopleCount: null,
  lastDetectionTime: null,
  error: null,
};

export function liveEventImageUrl(eventId: string): string {
  return `/api/ai/v2/events/${encodeURIComponent(eventId)}/image?kind=raw`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Latest live people-count and detection frame for one camera.
 *
 * Reads the shared person-count-ws feed (`PERSON_COUNT_WS_URL`) — the same
 * source the Media Wall and the no-person watcher use, backed by this
 * deployment's own mirrored `detection_events`. It previously opened a direct
 * WebSocket to the detection API's `/ws/v2/people-count`, which keys cameras
 * by that backend's own names and answered "camera not found" whenever they
 * differed from the ids the rest of this app uses (only surfaced in
 * production after the own-DB migration — locally the two happened to match).
 *
 * Seeds from `/api/events` on mount so an idle camera (no fresh feed message
 * for a while) still shows its last known count/frame immediately.
 */
export function useCameraLiveFeed(cameraId: string | null) {
  const [state, setState] = useState<CameraLiveFeedState>(INITIAL_STATE);
  // Reset during render (not in an effect) when the camera changes, so
  // callers don't have to remember to `key` the component by cameraId.
  const [trackedId, setTrackedId] = useState(cameraId);
  if (cameraId !== trackedId) {
    setTrackedId(cameraId);
    setState(INITIAL_STATE);
  }

  useEffect(() => {
    if (!cameraId) return;

    const wanted = cameraId.toLowerCase();
    let cancelled = false;

    fetch(`/api/events?camera_id=${encodeURIComponent(cameraId)}&limit=1`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        const row = asRecord(Array.isArray(payload.events) ? payload.events[0] : null);
        if (!row.event_id) return;
        setState((s) => ({
          ...s,
          zone: typeof row.zone === "string" ? row.zone : s.zone,
          scene: typeof row.scene === "string" ? row.scene : s.scene,
          latestEventId: typeof row.event_id === "string" ? row.event_id : s.latestEventId,
          peopleCount: Number.isFinite(Number(row.detection_count))
            ? Number(row.detection_count)
            : s.peopleCount,
          lastDetectionTime:
            typeof row.detection_ts === "string"
              ? row.detection_ts
              : typeof row.created_at === "string"
                ? row.created_at
                : s.lastDetectionTime,
        }));
      })
      .catch(() => {
        // Best-effort seed — the live feed below fills this in either way.
      });

    const unsubscribe = subscribeToAllCamerasFeed((data) => {
      if (cancelled) return;

      if (data.type === "__connection") {
        setState((s) => ({ ...s, connected: Boolean(data.connected) }));
        return;
      }
      if (data.type !== "people_count") return;
      if (String(data.camera_id ?? "").toLowerCase() !== wanted) return;

      setState((s) => ({
        ...s,
        connected: true,
        cameraName: typeof data.camera_name === "string" ? data.camera_name : s.cameraName,
        zone: typeof data.zone === "string" ? data.zone : s.zone,
        latestEventId:
          typeof data.event_id === "string" && data.event_id ? data.event_id : s.latestEventId,
        peopleCount: Number.isFinite(Number(data.people_count))
          ? Number(data.people_count)
          : s.peopleCount,
        lastDetectionTime: typeof data.time === "string" ? data.time : s.lastDetectionTime,
      }));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [cameraId]);

  return state;
}
