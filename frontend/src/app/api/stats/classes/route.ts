import { NextResponse } from "next/server";
import { getLiveClassCounts } from "@/lib/server/statsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const counts = await getLiveClassCounts();
    return NextResponse.json({ counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load live class counts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
