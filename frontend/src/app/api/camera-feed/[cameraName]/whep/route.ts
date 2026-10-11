import { NextResponse, type NextRequest } from "next/server";
import { bearer, isSafePathSegment } from "@/lib/server/pipelineUpstream";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;
const MAX_SDP_BYTES = 64 * 1024;

/**
 * WHEP offer -> streaming server, with CAMERA_FEED_TOKEN added server-side
 * (the browser never sees it). The upstream session URL (Location) is
 * rewritten to our DELETE route so the browser can end the session when a
 * tile closes (otherwise the streaming server keeps it until its own timeout,
 * and it has a small session limit).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cameraName: string }> }
) {
  const cameraName = decodeURIComponent((await params).cameraName);
  if (!isSafePathSegment(cameraName, 100)) {
    return NextResponse.json({ error: "Invalid camera name" }, { status: 400 });
  }
  const baseValue = process.env.CAMERA_FEED_BASE_URL;
  const token = process.env.CAMERA_FEED_TOKEN;
  if (!baseValue || !token) {
    return NextResponse.json({ error: "Live video is not configured" }, { status: 503 });
  }

  const offerSdp = await request.text();
  if (!offerSdp.trim()) return NextResponse.json({ error: "An SDP offer is required" }, { status: 400 });
  if (offerSdp.length > MAX_SDP_BYTES) return NextResponse.json({ error: "SDP offer too large" }, { status: 413 });

  let upstream: Response;
  try {
    const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
    upstream = await fetch(new URL(`${encodeURIComponent(cameraName)}/whep`, base), {
      method: "POST",
      headers: { Accept: "application/sdp", "Content-Type": "application/sdp", ...bearer(token) },
      body: offerSdp,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Live video server unreachable" }, { status: 502 });
  }

  const body = await upstream.text();
  if (!upstream.ok) {
    // Status is passed through (401/403 token refused, 404 no such stream,
    // 429/503 busy); the upstream body is not.
    return NextResponse.json({ error: `Streaming server returned HTTP ${upstream.status}` }, { status: upstream.status });
  }
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": upstream.headers.get("content-type") ?? "application/sdp",
  };
  const location = upstream.headers.get("location");
  const sessionId = location ? decodeURIComponent(location.split("?")[0].split("/").filter(Boolean).pop() ?? "") : "";
  if (isSafePathSegment(sessionId)) {
    headers.Location = `/api/camera-feed/${encodeURIComponent(cameraName)}/whep/${encodeURIComponent(sessionId)}`;
  }
  return new Response(body, { status: upstream.status, headers });
}
