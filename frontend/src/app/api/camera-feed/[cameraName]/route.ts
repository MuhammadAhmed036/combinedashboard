import type { NextRequest } from "next/server";
import { authenticatedFetch } from "@/lib/server/authenticatedFetch";
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
    const { cameraName } = await params;
    const upstreamUrl = await resolveFeedUrl(decodeURIComponent(cameraName));
    const headers = new Headers({ Accept: request.headers.get("accept") ?? "*/*" });
    const range = request.headers.get("range");
    if (range) headers.set("Range", range);

    const upstream = await authenticatedFetch(
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
