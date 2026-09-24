import { NextRequest, NextResponse } from "next/server";
import { getPeopleCountSeries } from "@/lib/server/camerasStore";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  try {
    const { cameraId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const fromTs = searchParams.get("from_ts");
    const toTs = searchParams.get("to_ts");
    if (!fromTs || !toTs) {
      return NextResponse.json({ error: "from_ts and to_ts are required" }, { status: 400 });
    }

    const points = await getPeopleCountSeries(cameraId, {
      fromTs,
      toTs,
      bucket: searchParams.get("bucket") ?? undefined,
      mode: searchParams.get("mode") ?? undefined,
    });
    return NextResponse.json({ points }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load people-count series";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
