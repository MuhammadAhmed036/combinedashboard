import { NextRequest, NextResponse } from "next/server";
import { createOrPlaceCamera, listCameras } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 1000;
    const cameras = await listCameras(limit);
    return NextResponse.json({ cameras }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cameras";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const cameraId = typeof body?.camera_id === "string" ? body.camera_id : "";
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!cameraId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: "camera_id, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    const camera = await createOrPlaceCamera({
      cameraId,
      cameraName: typeof body?.camera_name === "string" ? body.camera_name : cameraId,
      zone: typeof body?.zone === "string" ? body.zone : null,
      latitude,
      longitude,
    });
    return NextResponse.json(camera, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create camera";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
