import type { Zone } from "@/lib/types";

/**
 * Approximate real-world Islamabad locations for each operational zone.
 * The map package only ships the ICT outer boundary, not per-zone polygons
 * or camera coordinates, so these centers are hand-placed near the actual
 * neighbourhoods they're named after and used to derive marker/blob
 * positions. Swap for real surveyed zone polygons later without touching
 * any map rendering code.
 */
export const ZONES: Zone[] = [
  {
    id: "zone-blue-area",
    name: "Blue Area / F Sector",
    shortName: "Blue Area / F Sector",
    color: "#3b82f6",
    center: [73.0479, 33.7295],
    cameraCount: 46,
  },
  {
    id: "zone-g-sector",
    name: "G Sector",
    shortName: "G Sector",
    color: "#14b8a6",
    center: [72.9966, 33.7008],
    cameraCount: 35,
  },
  {
    id: "zone-i-sector",
    name: "I Sector",
    shortName: "I Sector",
    color: "#a855f7",
    center: [73.085, 33.67],
    cameraCount: 55,
  },
  {
    id: "zone-h-13",
    name: "H-13",
    shortName: "H-13",
    color: "#22c55e",
    center: [73.02, 33.63],
    cameraCount: 31,
  },
  {
    id: "zone-faizabad",
    name: "Faizabad / I-8",
    shortName: "Faizabad / I-8",
    color: "#f59e0b",
    center: [73.055, 33.655],
    cameraCount: 32,
  },
  {
    id: "zone-rawalpindi-border",
    name: "Rawalpindi Border Area",
    shortName: "Rawalpindi Border Area",
    color: "#f97316",
    center: [73.09, 33.595],
    cameraCount: 27,
  },
  {
    id: "zone-expressway",
    name: "Expressway Corridor",
    shortName: "Expressway Corridor",
    color: "#0ea5e9",
    center: [73.12, 33.57],
    cameraCount: 22,
  },
];

export function getZoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}

export const TOTAL_CAMERAS = ZONES.reduce((sum, z) => sum + z.cameraCount, 0);
