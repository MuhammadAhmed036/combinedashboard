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
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
