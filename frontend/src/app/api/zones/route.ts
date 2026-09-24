import { NextResponse } from "next/server";
import { listZoneSummaries } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const zones = await listZoneSummaries();
    return NextResponse.json({ zones }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load zones";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
