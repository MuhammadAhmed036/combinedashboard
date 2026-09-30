import type { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { getCameraSnapshot } from "@/lib/server/cameraSnapshot";

export const dynamic = "force-dynamic";

// Everything else (events, cameras, zones, stats, camera-retention) now
// reads directly from Postgres — see src/lib/server/*Store.ts. This proxy
// only remains for detection frame images: `detection_events` stores just a
// file path, and the actual JPEG bytes live on whatever host the detection
// backend serves them from, so that one endpoint still goes through
// DETECTION_API_BASE_URL.
const GET_ALLOWED_PREFIXES = ["v2/events"];

function isAllowed(endpoint: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => endpoint === prefix || endpoint.startsWith(`${prefix}/`));
}

function resolveUpstreamUrl(request: NextRequest, endpoint: string): URL {
  const baseValue = process.env.DETECTION_API_BASE_URL;
  if (!baseValue) throw new Error("DETECTION_API_BASE_URL is not configured");

  const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
  const upstreamUrl = new URL(`api/${endpoint}`, base);
  upstreamUrl.search = request.nextUrl.search;
  return upstreamUrl;
}

async function findCameraIdForEvent(eventId: string): Promise<string | null> {
  const prefixMatch = eventId.match(/^(?:absence|live|webrtc)-([^-]+)-/);
  if (prefixMatch && prefixMatch[1]) {
    return prefixMatch[1];
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT camera_id FROM alert_events WHERE event_id = $1 LIMIT 1",
      [eventId]
    );
    if (rows.length > 0 && rows[0].camera_id) {
      return String(rows[0].camera_id);
    }
  } catch {
    // best-effort DB lookup
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join("/");
  if (!isAllowed(endpoint, GET_ALLOWED_PREFIXES)) {
    return Response.json({ error: "Unknown AI API endpoint" }, { status: 404 });
  }

  const imageMatch = endpoint.match(/^v2\/events\/([^/]+)\/image/);
  const eventId = imageMatch ? decodeURIComponent(imageMatch[1]) : null;

  try {
    const upstreamUrl = resolveUpstreamUrl(request, endpoint);
    const acceptHeader = request.headers.get("accept") || "image/jpeg,image/*,*/*";

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: acceptHeader,
      },
      signal: request.signal,
    });

    if (upstream.ok) {
      const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
        },
      });
    }

    // Fallback: If upstream does not have the event frame (e.g. absence alert or camera without YOLO frames)
    if (eventId) {
      const cameraId = await findCameraIdForEvent(eventId);
      if (cameraId) {
        const liveSnap = await getCameraSnapshot(cameraId);
        if (liveSnap) {
          return new Response(new Uint8Array(liveSnap.buffer), {
            status: 200,
            headers: {
              "Content-Type": liveSnap.contentType,
              "Cache-Control": "public, max-age=5, stale-while-revalidate=10",
            },
          });
        }
      }
    }

    return new Response(upstream.body, { status: upstream.status });
  } catch (error) {
    if (eventId) {
      const cameraId = await findCameraIdForEvent(eventId);
      if (cameraId) {
        const liveSnap = await getCameraSnapshot(cameraId);
        if (liveSnap) {
          return new Response(new Uint8Array(liveSnap.buffer), {
            status: 200,
            headers: {
              "Content-Type": liveSnap.contentType,
              "Cache-Control": "public, max-age=5, stale-while-revalidate=10",
            },
          });
        }
      }
    }

    const message = error instanceof Error ? error.message : "AI API is unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
