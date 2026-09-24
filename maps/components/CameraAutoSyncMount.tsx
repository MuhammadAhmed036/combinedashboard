"use client";

import { useAutoSyncCameras } from "@/lib/hooks/useCameraLocations";

/** Keeps the camera registry self-healing for as long as the dashboard shell is open. */
export function CameraAutoSyncMount() {
  useAutoSyncCameras();
  return null;
}
