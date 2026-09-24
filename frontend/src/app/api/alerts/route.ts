import { NextRequest, NextResponse } from "next/server";
import { createAlert, listAlerts } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const status = params.get("status");
    const seenParam = params.get("seen");
    const alerts = await listAlerts({
      status: status && status !== "all" ? status : undefined,
      cameraId: params.get("camera_id") ?? undefined,
      zone: params.get("zone") ?? undefined,
      seen: seenParam === null ? undefined : seenParam === "true",
      q: params.get("q") ?? undefined,
      limit: Number(params.get("limit")) || 200,
    });
    return NextResponse.json(
      { alerts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load alerts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const cameraId = typeof body?.camera_id === "string" ? body.camera_id : "";
    const name = typeof body?.name === "string" ? body.name : "";
    const label = typeof body?.label === "string" ? body.label : "";
    if (!cameraId || !name || !label) {
      return NextResponse.json(
        { error: "camera_id, name, and label are required" },
        { status: 400 }
      );
    }

    const alert = await createAlert({
      cameraId,
      zone: typeof body?.zone === "string" ? body.zone : null,
      name,
      label,
      description: typeof body?.description === "string" ? body.description : null,
      sourceEventId: typeof body?.source_event_id === "string" ? body.source_event_id : null,
      boundingBox: body?.bounding_box ?? null,
      conditions: body?.conditions ?? {},
      metadata: body?.metadata ?? {},
      status: typeof body?.status === "string" ? body.status : "active",
      createdBy: typeof body?.created_by === "string" ? body.created_by : null,
    });
    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create alert rule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
