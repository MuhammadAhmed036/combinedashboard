import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMapRegion,
  deleteMapRegion,
  fetchMapRegions,
  type CreateMapRegionPayload,
} from "@/lib/services/mapRegionsService";

const QUERY_KEY = ["map-regions"];

export function useMapRegions() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchMapRegions });
}

export function useCreateMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMapRegionPayload) => createMapRegion(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteMapRegion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMapRegion(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
