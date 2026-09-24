import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/server/statsStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
