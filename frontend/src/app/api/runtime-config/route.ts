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
  return Response.json(
    {
      apiBase: process.env.DETECTION_API_BASE_URL ?? null,
      pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 5000,
      personCountWsBase: process.env.PERSON_COUNT_WS_URL ?? null,
      lunaWsUrl: process.env.NEXT_PUBLIC_LUNA_WS_URL || "ws://localhost:8092",
      lunaApiUrl:
        process.env.NEXT_PUBLIC_LUNA_API_URL ||
        `http://${process.env.LUNA_HOST || "192.168.18.71"}:${process.env.LUNA_GATEWAY_PORT || "8080"}/api/lp5/6`,
      lunaHost: process.env.LUNA_HOST || "192.168.18.71",
      lunaPort: process.env.LUNA_GATEWAY_PORT || "8080",
      lunaAccountId: process.env.LUNA_ACCOUNT_ID || "00000000-0000-4000-b000-000000000146",
      lunaAuthUser: process.env.LUNA_AUTH_USER || "root@visionlabs.ai",
      lunaAuthPass: process.env.LUNA_AUTH_PASS || "root",
      cameraFeedBaseUrl: process.env.CAMERA_FEED_BASE_URL || "http://192.168.18.216:8889",
      cameraFeedUser: process.env.CAMERA_FEED_USERNAME || "admin",
      cameraFeedPass: process.env.CAMERA_FEED_PASSWORD || "admin_123456",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
