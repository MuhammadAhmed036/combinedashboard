import type { NextRequest } from "next/server";
import { authenticatedFetch } from "@/lib/server/authenticatedFetch";
import { bearer, isSafePathSegment } from "@/lib/server/pipelineUpstream";
import { resolveFeedUrl } from "@/lib/server/streams";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cameraName: string }> }
) {
  try {
    const cameraName = decodeURIComponent((await params).cameraName);
    // ".." would survive encodeURIComponent and climb the streaming server's paths.
    if (!isSafePathSegment(cameraName, 100)) {
      return Response.json({ error: "Invalid camera name" }, { status: 400 });
    }
    const upstreamUrl = await resolveFeedUrl(cameraName);
    const headers = new Headers({ Accept: request.headers.get("accept") ?? "*/*" });
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    // The bearer token wins over Basic/Digest when it is configured.
    const token = process.env.CAMERA_FEED_TOKEN;
    const upstream = token
      ? await fetch(upstreamUrl, {
          method: "GET",
          headers: { ...Object.fromEntries(headers), ...bearer(token) },
          signal: request.signal,
          cache: "no-store",
        })
      : await authenticatedFetch(
          upstreamUrl,
          { method: "GET", headers, signal: request.signal },
          {
            username: process.env.CAMERA_FEED_USERNAME,
            password: process.env.CAMERA_FEED_PASSWORD,
          }
        );

    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load camera feed";
    return Response.json({ error: message }, { status: 502 });
  }
}
