import { NextRequest, NextResponse } from "next/server";
import { getCameraSnapshot } from "@/lib/server/cameraSnapshot";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  const { cameraId } = await params;
  if (!cameraId) {
    return NextResponse.json({ error: "Missing cameraId" }, { status: 400 });
  }

  const snapshot = await getCameraSnapshot(cameraId);
  if (!snapshot) {
    return NextResponse.json({ error: "No snapshot available for camera" }, { status: 404 });
  }

  return new Response(new Uint8Array(snapshot.buffer), {
    status: 200,
    headers: {
      "Content-Type": snapshot.contentType,
      "Cache-Control": "public, max-age=2, stale-while-revalidate=5",
    },
  });
}
