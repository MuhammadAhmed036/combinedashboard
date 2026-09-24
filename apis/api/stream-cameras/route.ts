import { NextResponse } from "next/server";
import { fetchStreamCameras } from "@/lib/server/streams";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cameras = await fetchStreamCameras();
    return NextResponse.json(cameras, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cameras";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
