import { NextRequest, NextResponse } from "next/server";
import { deleteAlert, getAlertByAlertId, updateAlertStatus } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const alert = await getAlertByAlertId(alertId);
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json(alert, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load alert";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ alertId: string }> }) {
  try {
    const { alertId } = await params;
    const body = await request.json().catch(() => null);
    const status = typeof body?.status === "string" ? body.status : "";
    if (!status) return NextResponse.json({ error: "status is required" }, { status: 400 });

    const alert = await updateAlertStatus(alertId, status);
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json(alert);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update alert rule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  try {
    const { alertId } = await params;
    const deleted = await deleteAlert(alertId);
    if (!deleted) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete alert rule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
