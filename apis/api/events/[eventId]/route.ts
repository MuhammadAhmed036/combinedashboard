import { NextRequest, NextResponse } from "next/server";
import { getEventById } from "@/lib/server/eventsStore";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const event = await getEventById(eventId);
    if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    return NextResponse.json(event, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
