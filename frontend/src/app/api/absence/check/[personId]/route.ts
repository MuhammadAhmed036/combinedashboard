import { NextRequest, NextResponse } from "next/server";
import { evaluateAbsenceLogic } from "@/lib/server/absenceEngine";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string }> }
) {
  const { personId } = await params;
  const cameraName = request.nextUrl.searchParams.get("cameraName") || "AXI";
  const threshold = Number(request.nextUrl.searchParams.get("threshold")) || 10;

  const result = await evaluateAbsenceLogic({
    personId,
    cameraName,
    thresholdSeconds: threshold,
  });

  return NextResponse.json(result);
}
