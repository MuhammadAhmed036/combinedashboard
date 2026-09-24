import type { AiFeature, Camera } from "@/lib/types";
import { createRng } from "@/lib/mock/seed";
import { ZONES } from "@/lib/mock/zones";

const CAMERA_TYPES: Camera["type"][] = ["PTZ Dome", "Bullet", "Fixed", "LPR", "Thermal"];

const STREET_NAMES = [
  "Main Gate",
  "Parking Entrance",
  "Street 12 Intersection",
  "Building A Entrance",
  "Block I-9",
  "Market Road",
  "School Zone",
  "Gas Station",
  "Central Plaza",
  "East Perimeter",
  "North Boundary",
  "South Gate",
  "Toll Plaza",
  "KM 15",
  "Warehouse 7",
  "Tower B Roof",
  "Sector Gate",
  "Border Crossing",
  "Service Road",
  "Pedestrian Bridge",
];

const ALL_AI_FEATURES: { id: string; label: string }[] = [
  { id: "person-counting", label: "Person Counting" },
  { id: "crowd-density", label: "Crowd Density" },
  { id: "loitering-detection", label: "Loitering Detection" },
  { id: "line-crossing", label: "Line Crossing" },
  { id: "face-recognition", label: "Face Recognition" },
  { id: "vehicle-detection", label: "Vehicle Detection" },
  { id: "intrusion-detection", label: "Intrusion Detection" },
  { id: "face-blur", label: "Face Blur" },
];

function zonePrefix(zoneId: string) {
  switch (zoneId) {
    case "zone-blue-area":
      return "BL";
    case "zone-g-sector":
      return "G";
    case "zone-i-sector":
      return "I";
    case "zone-h-13":
      return "H13";
    case "zone-faizabad":
      return "FAI";
    case "zone-rawalpindi-border":
      return "RWP";
    case "zone-expressway":
      return "EXP";
    default:
      return "CAM";
  }
}

function densityFromPercent(pct: number): Camera["density"] {
  if (pct >= 80) return "Critical";
  if (pct >= 55) return "High";
  if (pct >= 25) return "Medium";
  return "Low";
}

function buildCameras(): Camera[] {
  const rng = createRng(20250524);
  const cameras: Camera[] = [];

  ZONES.forEach((zone) => {
    for (let i = 0; i < zone.cameraCount; i++) {
      const idx = i + 1;
      const prefix = zonePrefix(zone.id);
      const code = `CAM-${prefix}-${String(idx).padStart(2, "0")}`;
      const id = code.toLowerCase();

      // Jitter the position within roughly ~2.5km of the zone center.
      const lngJitter = rng.float(-0.018, 0.018, 5);
      const latJitter = rng.float(-0.014, 0.014, 5);

      const status: Camera["status"] = rng.bool(0.931) ? "online" : "offline";
      const densityPercent = status === "online" ? rng.int(4, 96) : 0;
      const personCount = status === "online" ? rng.int(0, 60) : 0;

      const featureCount = rng.int(3, 6);
      const aiFeatures: AiFeature[] = rng
        .shuffle(ALL_AI_FEATURES)
        .slice(0, featureCount)
        .map((f) => ({ ...f, active: status === "online" }));

      cameras.push({
        id,
        code,
        name: `${rng.pick(STREET_NAMES)} ${idx > STREET_NAMES.length ? idx : ""}`.trim(),
        zoneId: zone.id,
        zoneName: zone.name,
        location: `${zone.name}, Islamabad City`,
        position: [zone.center[0] + lngJitter, zone.center[1] + latJitter],
        status,
        type: rng.pick(CAMERA_TYPES),
        currentPersonCount: personCount,
        density: densityFromPercent(densityPercent),
        densityPercent,
        aiFeatures,
        thumbnailSeed: `${id}-${rng.int(1, 999)}`,
        isFavorite: rng.bool(0.15),
      });
    }
  });

  return cameras;
}

export const CAMERAS: Camera[] = buildCameras();

export function getCameraById(id: string): Camera | undefined {
  return CAMERAS.find((c) => c.id === id);
}

export function getCamerasByZone(zoneId: string): Camera[] {
  return CAMERAS.filter((c) => c.zoneId === zoneId);
}
