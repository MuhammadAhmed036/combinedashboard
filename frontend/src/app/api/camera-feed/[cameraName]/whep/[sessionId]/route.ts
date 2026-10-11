import { NextResponse, type NextRequest } from "next/server";
import { bearer, isSafePathSegment } from "@/lib/server/pipelineUpstream";

export const dynamic = "force-dynamic";

/** Ends a WHEP session on the streaming server (tile closed or scrolled away). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cameraName: string; sessionId: string }> }
) {
  const p = await params;
  const cameraName = decodeURIComponent(p.cameraName);
  const sessionId = decodeURIComponent(p.sessionId);
  if (!isSafePathSegment(cameraName, 100) || !isSafePathSegment(sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  const baseValue = process.env.CAMERA_FEED_BASE_URL;
  const token = process.env.CAMERA_FEED_TOKEN;
  if (!baseValue || !token) return new Response(null, { status: 204 });
  try {
    const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
    const upstream = await fetch(
      new URL(`${encodeURIComponent(cameraName)}/whep/${encodeURIComponent(sessionId)}`, base),
      {
        method: "DELETE",
        headers: bearer(token),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
        cache: "no-store",
      }
    );
    await upstream.body?.cancel();
  } catch {
    // Best effort: the streaming server also expires idle sessions itself.
  }
  return new Response(null, { status: 204 });
}
