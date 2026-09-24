import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { MapRegion } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "map-regions.json");

async function readRegions(): Promise<MapRegion[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRegions(regions: MapRegion[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(regions, null, 2), "utf-8");
}

export async function listMapRegions(): Promise<MapRegion[]> {
  return readRegions();
}

export interface CreateMapRegionInput {
  name: string;
  color: string;
  coordinates: [number, number][];
}

export async function createMapRegion(input: CreateMapRegionInput): Promise<MapRegion> {
  const region: MapRegion = {
    id: randomUUID(),
    name: input.name,
    color: input.color,
    coordinates: input.coordinates,
    createdAt: new Date().toISOString(),
  };
  const regions = await readRegions();
  regions.push(region);
  await writeRegions(regions);
  return region;
}

/** Returns false if no region with that id existed (nothing to delete). */
export async function deleteMapRegion(id: string): Promise<boolean> {
  const regions = await readRegions();
  const next = regions.filter((region) => region.id !== id);
  if (next.length === regions.length) return false;
  await writeRegions(next);
  return true;
}
