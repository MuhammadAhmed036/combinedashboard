/** Derives the detection API's WebSocket origin from its base URL (http→ws, https→wss). */
export function toWsBaseUrl(base: string | null): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Person-count WebSocket URL for the browser: PERSON_COUNT_WS_URL when set,
 * otherwise ws(s)://<page host>:PERSON_COUNT_WS_PORT, so the port lives in one
 * .env key and the URL works from any operator PC.
 */
export function personCountWsUrl(
  base: string | null,
  port: number | null,
  location: { protocol: string; hostname: string } | null = typeof window !== "undefined" ? window.location : null
): string | null {
  if (base) return base;
  if (!port || !location?.hostname) return null;
  const host = location.hostname.includes(":") && !location.hostname.startsWith("[") ? `[${location.hostname}]` : location.hostname;
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${host}:${port}`;
}
