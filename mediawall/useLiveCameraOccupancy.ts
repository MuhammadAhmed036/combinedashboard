"use client";

import { useEffect, useState } from "react";
import { subscribeToAllCamerasFeed } from "@/lib/allCamerasFeed";

export interface CameraOccupancy {
  cameraId: string;
  cameraName: string;
  zone: string | null;
  peopleCount: number;
  time: string;
}

/**
 * Tracks the latest live people-count per camera via the shared
 * `/ws/v2/people-count/all` feed. A camera's entry holds its most recent
 * reported count until a newer message updates it — there's no per-camera
 * polling involved.
 */
export function useLiveCameraOccupancy() {
  const [occupancy, setOccupancy] = useState<Record<string, CameraOccupancy>>({});

  useEffect(() => {
    return subscribeToAllCamerasFeed((data) => {
      if (data.type !== "people_count") return;
      const cameraId = String(data.camera_id ?? "");
      const peopleCount = Number(data.people_count);
      if (!cameraId || !Number.isFinite(peopleCount)) return;

      setOccupancy((prev) => ({
        ...prev,
        [cameraId]: {
          cameraId,
          cameraName: typeof data.camera_name === "string" ? data.camera_name : cameraId,
          zone: typeof data.zone === "string" ? data.zone : null,
          peopleCount,
          time: typeof data.time === "string" ? data.time : new Date().toISOString(),
        },
      }));
    });
  }, []);

  return occupancy;
}
