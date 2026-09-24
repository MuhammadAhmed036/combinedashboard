import { NextResponse } from "next/server";
import { getLiveClassCountsByCamera } from "@/lib/server/statsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cameras = await getLiveClassCountsByCamera();
    return NextResponse.json({ cameras }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load live class counts by camera";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
