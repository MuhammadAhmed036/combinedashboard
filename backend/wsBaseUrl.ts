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
