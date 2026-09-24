import { NextRequest, NextResponse } from "next/server";
import { setAlertSeen } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const body = await request.json().catch(() => ({}));
    const alert = await setAlertSeen(alertId, {
      user: typeof body?.user === "string" ? body.user : null,
      seen: typeof body?.seen === "boolean" ? body.seen : undefined,
    });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json(alert);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to acknowledge alert";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
