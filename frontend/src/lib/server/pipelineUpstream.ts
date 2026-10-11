// Small helpers for the SafeCity pipeline upstreams (Stage 2 detection API,
// streaming server stream-status API, WHEP). Deliberately free of imports so
// tests/pipeline-upstream.test.mjs can load this file directly with node.

/** `Authorization: Bearer <token>` header, or no header when the token is unset. */
export function bearer(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One URL path segment that cannot climb or inject: letters, digits and . _ : - only, never "." or "..". */
export function isSafePathSegment(value: unknown, maxLength = 200): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/.test(value) &&
    !/^\.+$/.test(value)
  );
}

/**
 * Camera status per stream from the streaming server's stream-status API
 * (`{ streams: [{ name, online }] }`), keyed by lower-cased stream name.
 * `online: true` is "running", anything else "stopped" — the strings the
 * absence engine and /api/cameras/<id>/frame-status already compare against.
 */
export function streamStatusMap(payload: unknown): Map<string, "running" | "stopped"> {
  const map = new Map<string, "running" | "stopped">();
  const streams =
    payload && typeof payload === "object" ? (payload as { streams?: unknown }).streams : undefined;
  if (!Array.isArray(streams)) return map;
  for (const row of streams) {
    if (!row || typeof row !== "object") continue;
    const { name, online } = row as { name?: unknown; online?: unknown };
    if (typeof name !== "string" || !name.trim()) continue;
    map.set(name.trim().toLowerCase(), online === true ? "running" : "stopped");
  }
  return map;
}
