import type { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { getCameraSnapshot } from "@/lib/server/cameraSnapshot";
import { bearer, isSafePathSegment } from "@/lib/server/pipelineUpstream";

export const dynamic = "force-dynamic";

// Everything else (events, cameras, zones, stats, camera-retention) now
// reads directly from Postgres — see src/lib/server/*Store.ts. This proxy
// only remains for detection frame images: `detection_events` stores just a
// file path, and the actual JPEG bytes live on whatever host the detection
// backend serves them from, so that one endpoint still goes through
// DETECTION_API_BASE_URL, with DETECTION_API_TOKEN added here, server-side.
//
// Exactly one shape is forwarded: v2/events/<event id>/image[?kind=raw|annotated].
// (A prefix check would let "v2/events/../../x" reach any viewer path with the token.)
const IMAGE_KINDS = new Set(["raw", "annotated"]);

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isImagePath(path: string[]): boolean {
  return (
    path.length === 4 &&
    path[0] === "v2" &&
    path[1] === "events" &&
    path[3] === "image" &&
    isSafePathSegment(safeDecode(path[2]))
  );
}

function resolveUpstreamUrl(endpoint: string, kind: string): URL {
  const baseValue = process.env.DETECTION_API_BASE_URL;
  if (!baseValue) throw new Error("DETECTION_API_BASE_URL is not configured");

  const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
  const upstreamUrl = new URL(`api/${endpoint}`, base);
  upstreamUrl.searchParams.set("kind", kind);
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

// The detection event behind a stored frame path. The mirror keeps
// raw_image_path verbatim, so an exact lookup is authoritative (file names
// changed with the Stage 2 pipeline and can no longer be split reliably).
async function eventIdForRawImagePath(rawPath: string | null): Promise<string | null> {
  if (!rawPath) return null;
  const { rows } = await getPool().query(
    "SELECT event_id FROM detection_events WHERE raw_image_path = $1 ORDER BY id DESC LIMIT 1",
    [rawPath]
  );
  if (rows.length > 0 && rows[0].event_id) return String(rows[0].event_id);
  const legacy = rawPath.match(/(docker-ovcpp-[^.]+)/);
  return legacy ? legacy[1] : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  if (!isImagePath(path)) {
    return Response.json({ error: "Unknown AI API endpoint" }, { status: 404 });
  }
  const kind = request.nextUrl.searchParams.get("kind") ?? "raw";
  if (!IMAGE_KINDS.has(kind)) {
    return Response.json({ error: "kind must be raw or annotated" }, { status: 400 });
  }
  const eventId = safeDecode(path[2]) as string;

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
            underlyingEventId = await eventIdForRawImagePath(String(rows[0].source_raw_image_path));
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
    const targetEventId = underlyingEventId ?? eventId;
    const upstreamUrl = resolveUpstreamUrl(`v2/events/${encodeURIComponent(targetEventId)}/image`, kind);

    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        Accept: acceptHeader,
        ...bearer(process.env.DETECTION_API_TOKEN),
      },
      signal: request.signal,
      cache: "no-store",
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
