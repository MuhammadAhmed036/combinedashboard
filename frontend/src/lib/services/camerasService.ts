import type { Camera } from "@/lib/types";

export async function fetchCameras(): Promise<Camera[]> {
  const response = await fetch("/api/stream-cameras", { cache: "no-store" });
  if (!response.ok) throw new Error(`Camera API returned ${response.status}`);
  return response.json() as Promise<Camera[]>;
}

export async function fetchCamerasByZone(zoneId: string): Promise<Camera[]> {
  const cameras = await fetchCameras();
  return cameras.filter((camera) => camera.zoneId === zoneId);
}

export async function fetchCameraById(id: string): Promise<Camera | undefined> {
  const cameras = await fetchCameras();
  return cameras.find(
    (camera) => camera.id === id || camera.sourceName === id || camera.code === id
  );
}
