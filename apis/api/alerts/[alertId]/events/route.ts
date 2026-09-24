import { NextRequest, NextResponse } from "next/server";
import { appendAlertEvent, listAlertEvents } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 100;
    const events = await listAlertEvents(alertId, limit);
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load alert history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const body = await request.json().catch(() => null);
    const eventId = typeof body?.event_id === "string" ? body.event_id : "";
    if (!eventId) return NextResponse.json({ error: "event_id is required" }, { status: 400 });

    const event = await appendAlertEvent(alertId, {
      eventId,
      detectionTs: typeof body?.detection_ts === "string" ? body.detection_ts : null,
      personCountInside: Number(body?.person_count_inside) || 0,
      personCountOutside: Number(body?.person_count_outside) || 0,
      boundingBox: body?.bounding_box ?? null,
      detectionsJson: body?.detections_json ?? null,
      note: typeof body?.note === "string" ? body.note : null,
      createdBy: typeof body?.created_by === "string" ? body.created_by : null,
    });
    if (!event) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record alert match";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
