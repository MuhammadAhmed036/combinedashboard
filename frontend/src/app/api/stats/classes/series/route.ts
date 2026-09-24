import { NextRequest, NextResponse } from "next/server";
import { getClassTrendSeries } from "@/lib/server/statsStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const fromTs = params.get("from_ts");
    const toTs = params.get("to_ts");
    if (!fromTs || !toTs) {
      return NextResponse.json({ error: "from_ts and to_ts are required" }, { status: 400 });
    }
    const bucketSeconds = Number(params.get("bucket_seconds")) || undefined;

    const points = await getClassTrendSeries({ fromTs, toTs, bucketSeconds });
    return NextResponse.json({ points }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load class trend series";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
