import type { MapRegion } from "@/lib/types";

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  const detail = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
  return typeof detail === "string" ? detail : fallback;
}

export async function fetchMapRegions(): Promise<MapRegion[]> {
  const response = await fetch("/api/map-regions", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Map regions API returned ${response.status}`));
  }
  return response.json();
}

export interface CreateMapRegionPayload {
  name: string;
  color: string;
  coordinates: [number, number][];
}

export async function createMapRegion(payload: CreateMapRegionPayload): Promise<MapRegion> {
  const response = await fetch("/api/map-regions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to save region (${response.status})`));
  }
  return response.json();
}

export async function deleteMapRegion(id: string): Promise<void> {
  const response = await fetch(`/api/map-regions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Failed to delete region (${response.status})`));
  }
}
