import { NextResponse } from "next/server";
import { listAllAlertEvents } from "@/lib/server/alertsStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraId = searchParams.get("camera_id") ?? undefined;
    const dateFrom = searchParams.get("date_from") ?? undefined;
    const dateTo = searchParams.get("date_to") ?? undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const events = await listAllAlertEvents({
      cameraId,
      dateFrom,
      dateTo,
      limit,
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Failed to list all alert events:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
