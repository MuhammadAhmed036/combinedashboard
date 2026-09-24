import { useQuery } from "@tanstack/react-query";
import { fetchAlertRules } from "@/lib/services/alertRulesService";

export function useLiveAlertFeed() {
  return useQuery({
    queryKey: ["alerts", "live-feed"],
    queryFn: () => fetchAlertRules({ status: "active" }),
    refetchInterval: 15_000,
  });
}

export function useAlertsByCamera(cameraId: string | null) {
  return useQuery({
    queryKey: ["alerts", "camera", cameraId],
    queryFn: () => fetchAlertRules({ cameraId: cameraId as string }),
    enabled: Boolean(cameraId),
  });
}
