import type { NextRequest } from "next/server";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const endpoint = path.join("/");
  if (!isAllowed(endpoint, GET_ALLOWED_PREFIXES)) {
    return Response.json({ error: "Unknown AI API endpoint" }, { status: 404 });
  }

  try {
    const upstreamUrl = resolveUpstreamUrl(request, endpoint);
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: request.signal,
    });
    const body = await upstream.arrayBuffer();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI API is unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
