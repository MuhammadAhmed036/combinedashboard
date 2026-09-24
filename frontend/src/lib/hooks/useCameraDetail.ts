import { useQuery } from "@tanstack/react-query";
import { fetchCameraEvents, fetchCameraRetention } from "@/lib/services/cameraEventsService";

export function useCameraEvents(cameraId: string | null, limit = 20) {
  return useQuery({
    queryKey: ["camera-events", cameraId, limit],
    queryFn: () => fetchCameraEvents(cameraId as string, limit),
    enabled: Boolean(cameraId),
    refetchInterval: 10_000,
  });
}

export function useCameraRetention(cameraId: string | null) {
  return useQuery({
    queryKey: ["camera-retention", cameraId],
    queryFn: () => fetchCameraRetention(cameraId as string),
    enabled: Boolean(cameraId),
    refetchInterval: 30_000,
  });
}
