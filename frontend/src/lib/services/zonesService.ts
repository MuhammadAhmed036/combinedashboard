import type { Zone } from "@/lib/types";
import { ZONES, getZoneById } from "@/lib/mock/zones";

const LATENCY_MS = 180;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function fetchZones(): Promise<Zone[]> {
  return delay(ZONES);
}

export async function fetchZoneById(id: string): Promise<Zone | undefined> {
  return delay(getZoneById(id));
}
