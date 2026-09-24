import { NextResponse } from "next/server";
import { getAlertStats } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getAlertStats();
    return NextResponse.json(
      { total: stats.total, seen: stats.seen, unseen: stats.unseen, by_status: stats.byStatus },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load alert stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
