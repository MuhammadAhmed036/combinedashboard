export const dynamic = "force-dynamic";

/**
 * The only two config values the browser needs. Read fresh from process.env
 * on every request so editing .env + recreating the container takes effect
 * with no rebuild. Deliberately NOT NEXT_PUBLIC_* — that prefix bakes the
 * value into both the client AND server bundles at build time, freezing it
 * permanently (confirmed: the old NEXT_PUBLIC_API_BASE value was hardcoded
 * as a string literal in both the client chunk and three server chunks).
 * Never add a credential to this response — it's served unauthenticated.
 */
export async function GET() {
  const lunaHost = process.env.LUNA_HOST || process.env.NEXT_PUBLIC_LUNA_HOST || null;
  const lunaPort = process.env.LUNA_GATEWAY_PORT || process.env.LUNA_WEB_PORT || process.env.NEXT_PUBLIC_LUNA_PORT || null;
  const lunaApiUrl =
    process.env.NEXT_PUBLIC_LUNA_API_URL ||
    (lunaHost && lunaPort ? `http://${lunaHost}:${lunaPort}/api/lp5/6` : null);

  return Response.json(
    {
      apiBase: process.env.DETECTION_API_BASE_URL ?? null,
      pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 5000,
      personCountWsBase: process.env.PERSON_COUNT_WS_URL ?? null,
      lunaWsUrl: process.env.NEXT_PUBLIC_LUNA_WS_URL ?? null,
      lunaWsPort: process.env.LUNA_WS_PORT || process.env.NEXT_PUBLIC_LUNA_WS_PORT || null,
      lunaApiUrl: lunaApiUrl ?? null,
      lunaHost: lunaHost ?? null,
      lunaPort: lunaPort ?? null,
      lunaAccountId: process.env.LUNA_ACCOUNT_ID || process.env.NEXT_PUBLIC_LUNA_ACCOUNT_ID || null,
      lunaAuthUser: process.env.LUNA_AUTH_USER || process.env.NEXT_PUBLIC_LUNA_AUTH_USER || null,
      lunaAuthPass: process.env.LUNA_AUTH_PASS || process.env.NEXT_PUBLIC_LUNA_AUTH_PASS || null,
      cameraFeedBaseUrl: process.env.CAMERA_FEED_BASE_URL ?? null,
      cameraFeedUser: process.env.CAMERA_FEED_USERNAME ?? null,
      cameraFeedPass: process.env.CAMERA_FEED_PASSWORD ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
