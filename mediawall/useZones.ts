import { useQuery } from "@tanstack/react-query";
import { fetchZoneById, fetchZones } from "@/lib/services/zonesService";

export function useZones() {
  return useQuery({ queryKey: ["zones"], queryFn: fetchZones });
}

export function useZone(id: string | null) {
  return useQuery({
    queryKey: ["zone", id],
    queryFn: () => fetchZoneById(id as string),
    enabled: Boolean(id),
  });
}
