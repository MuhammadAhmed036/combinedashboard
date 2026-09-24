import { NextRequest, NextResponse } from "next/server";
import { getAbsenceDailySummary, listAbsenceEvents } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 100;
    const day = request.nextUrl.searchParams.get("day") ?? new Date().toISOString();
    const [events, summary] = await Promise.all([
      listAbsenceEvents(alertId, limit),
      getAbsenceDailySummary(alertId, day),
    ]);
    return NextResponse.json({ events, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load absence history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}