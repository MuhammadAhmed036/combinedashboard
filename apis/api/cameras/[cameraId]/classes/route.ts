import { NextRequest, NextResponse } from "next/server";
import { getCameraClasses } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  try {
    const { cameraId } = await params;
    const result = await getCameraClasses(cameraId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load camera classes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
