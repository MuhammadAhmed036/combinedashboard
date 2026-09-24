import { NextResponse } from "next/server";
import { syncCamerasFromDetections } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncCamerasFromDetections();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Camera sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
