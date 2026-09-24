import { NextRequest, NextResponse } from "next/server";
import { getCamera, updateCameraCoords } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  try {
    const { cameraId } = await params;
    const camera = await getCamera(cameraId);
    if (!camera) return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    return NextResponse.json(camera, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load camera";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  try {
    const { cameraId } = await params;
    const body = await request.json().catch(() => null);
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "latitude and longitude are required" }, { status: 400 });
    }

    const camera = await updateCameraCoords(cameraId, { latitude, longitude });
    if (!camera) return NextResponse.json({ error: "Camera not found" }, { status: 404 });
    return NextResponse.json(camera);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update camera";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
