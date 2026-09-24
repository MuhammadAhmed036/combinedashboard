import { NextRequest, NextResponse } from "next/server";
import { listEvents } from "@/lib/server/eventsStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const { events, total } = await listEvents({
      cameraId: params.get("camera_id") ?? undefined,
      limit: Number(params.get("limit")) || 20,
      dateFrom: params.get("date_from") ?? undefined,
      dateTo: params.get("date_to") ?? undefined,
    });
    return NextResponse.json({ events, total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
