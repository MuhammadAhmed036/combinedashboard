import { NextResponse } from "next/server";
import { fetchCameraStatuses } from "@/lib/server/absenceEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const statuses = await fetchCameraStatuses();
    const result: Record<string, string> = {};
    for (const [cam, status] of statuses.entries()) {
      result[cam] = status;
    }
    return NextResponse.json({ ok: true, cameras: result });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to fetch camera statuses" },
      { status: 500 }
    );
  }
}
