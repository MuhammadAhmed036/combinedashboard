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

function extractEventIdFromPath(rawPath: string | null): string | null {
  if (!rawPath) return null;
  const match = rawPath.match(/(docker-ovcpp-[^.]+)/);
  if (match) return match[1];
  const filename = rawPath.split("/").pop() || "";
  const parts = filename.split("_");
  if (parts.length >= 3) {
    return parts.slice(2).join("_").replace(/\.[^.]+$/, "");
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
    const acceptHeader = request.headers.get("accept") || "image/jpeg,image/*,*/*";

    const isAbsenceEvent = Boolean(eventId && (eventId.startsWith("absence-") || eventId.startsWith("live-")));

    // 1. For absence or synthetic alert events, resolve the recorded historical frame from database:
    let underlyingEventId: string | null = null;
    let savedImagePath: string | null = null;
    let cameraId: string | null = null;

    if (eventId) {
      try {
        const pool = getPool();
        const { rows } = await pool.query(
          "SELECT source_raw_image_path, saved_image_path, camera_id FROM alert_events WHERE event_id = $1 LIMIT 1",
          [eventId]
        );
        if (rows.length > 0) {
          savedImagePath = rows[0].saved_image_path ? String(rows[0].saved_image_path) : null;
          cameraId = rows[0].camera_id ? String(rows[0].camera_id) : null;
          if (rows[0].source_raw_image_path) {
            underlyingEventId = extractEventIdFromPath(String(rows[0].source_raw_image_path));
          }
        }

        // If this is an absence alert and underlyingEventId wasn't found in alert_events,
        // look up the latest available YOLO frame for this camera from detection_events:
        if (isAbsenceEvent && !underlyingEventId) {
          const resolvedCamId = cameraId || (await findCameraIdForEvent(eventId));
          if (resolvedCamId) {
            const { rows: yoloRows } = await pool.query(
              `SELECT event_id, raw_image_path FROM detection_events
               WHERE LOWER(TRIM(camera_id)) = LOWER(TRIM($1)) AND raw_image_status = 'available'
               ORDER BY id DESC LIMIT 1`,
              [resolvedCamId]
            );
            if (yoloRows.length > 0) {
              underlyingEventId = yoloRows[0].event_id;
            }
          }
        }
      } catch (err) {
        console.error("DB lookup error for event image:", err);
      }
    }

    // 2. If a snapshot was already frozen/saved for this alert, return it (NEVER overwrite with live feed!)
    if (savedImagePath && savedImagePath.startsWith("data:image/")) {
      const [header, base64] = savedImagePath.split(",");
      const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      const buffer = Buffer.from(base64, "base64");
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
        },
      });
    }

    // 3. If an underlying YOLO detection frame is available from the time of the alert, fetch that exact frame!
    const targetEndpoint = underlyingEventId ? `v2/events/${encodeURIComponent(underlyingEventId)}/image` : endpoint;
    const upstreamUrl = resolveUpstreamUrl(request, targetEndpoint);

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

    // For absence alerts: NEVER fallback to live WebRTC/RTSP stream/snapshot.
    // The forensic image MUST strictly come from the YOLO frame.
    if (isAbsenceEvent) {
      return Response.json({ error: "No YOLO detection frame available for this absence alert" }, { status: 404 });
    }

    // 4. Fallback if upstream does not have the frame (only for generic non-absence camera queries)
    if (eventId) {
      const resolvedCamId = cameraId || (await findCameraIdForEvent(eventId));
      if (resolvedCamId) {
        const liveSnap = await getCameraSnapshot(resolvedCamId);
        if (liveSnap) {
          return new Response(new Uint8Array(liveSnap.buffer), {
            status: 200,
            headers: {
              "Content-Type": liveSnap.contentType,
              "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
            },
          });
        }
      }
    }

    return new Response(upstream.body, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI API is unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
