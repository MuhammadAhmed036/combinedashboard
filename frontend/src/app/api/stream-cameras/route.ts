import { NextResponse } from "next/server";
import { fetchStreamCameras } from "@/lib/server/streams";
import { listCameras } from "@/lib/server/camerasStore";
import type { Camera } from "@/lib/types";

export const dynamic = "force-dynamic";

type CameraRow = Record<string, unknown>;

function text(row: CameraRow, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function fallbackCamera(row: CameraRow): Camera {
  const id = text(row, "camera_id", text(row, "id", "camera"));
  const name = text(row, "camera_name", id);
  const zoneName = text(row, "zone", "Registered Cameras");
  const zoneId = zoneName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "registered-cameras";

  return {
    id,
    code: id,
    name,
    zoneId,
    zoneName,
    location: text(row, "address", text(row, "scene", "Registered camera")),
    position: [
      Number(row.longitude) || 73.0479,
      Number(row.latitude) || 33.7295,
    ],
    status: "offline",
    type: "Fixed",
    currentPersonCount: 0,
    density: "Low",
    densityPercent: 0,
    aiFeatures: [],
    thumbnailSeed: id,
    isFavorite: false,
    sourceName: id,
  };
}

export async function GET() {
  try {
    const cameras = await fetchStreamCameras();
    return NextResponse.json(cameras, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.warn("[stream-cameras] Streams API unavailable, falling back to registry:", error);
    try {
      const rows = await listCameras(1000);
      return NextResponse.json(rows.map(fallbackCamera), {
        headers: {
          "Cache-Control": "no-store",
          "X-Camera-Source": "registry-fallback",
        },
      });
    } catch (fallbackError) {
      const message = fallbackError instanceof Error ? fallbackError.message : "Unable to load cameras";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
}
