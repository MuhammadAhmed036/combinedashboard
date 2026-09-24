import { toWsBaseUrl } from "@/lib/wsBaseUrl";

export const DEFAULT_POLL_INTERVAL_MS = 5000;

export interface RuntimeConfig {
  apiBase: string | null;
  wsBase: string | null;
  pollIntervalMs: number;
  /** Base URL of the standalone person-count WebSocket service (Media Wall live occupancy). */
  personCountWsBase: string | null;
}

const FALLBACK: RuntimeConfig = {
  apiBase: null,
  wsBase: null,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  personCountWsBase: null,
};

let resolved: RuntimeConfig | null = null;
let pending: Promise<RuntimeConfig> | null = null;

/**
 * Fetches the two client-needed config values from the server at runtime
 * instead of reading them out of the build (see `/api/runtime-config`'s doc
 * comment for why). Memoized module-wide — every caller across the app
 * shares one request and one resolved value. Never rejects: any failure
 * (server not up yet, network hiccup) resolves to a safe fallback so callers
 * never need their own try/catch.
 */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (resolved) return Promise.resolve(resolved);
  if (pending) return pending;

  pending = fetch("/api/runtime-config", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return FALLBACK;
      const payload = (await response.json()) as {
        apiBase?: unknown;
        pollIntervalMs?: unknown;
        personCountWsBase?: unknown;
      };
      const apiBase = typeof payload.apiBase === "string" ? payload.apiBase : null;
      const pollIntervalMs =
        typeof payload.pollIntervalMs === "number" && payload.pollIntervalMs > 0
          ? payload.pollIntervalMs
          : DEFAULT_POLL_INTERVAL_MS;
      const personCountWsBase =
        typeof payload.personCountWsBase === "string" ? payload.personCountWsBase : null;
      return { apiBase, wsBase: toWsBaseUrl(apiBase), pollIntervalMs, personCountWsBase };
    })
    .catch(() => FALLBACK)
    .then((config) => {
      resolved = config;
      pending = null;
      return config;
    });

  return pending;
}

/** Synchronous peek at an already-resolved config, for hooks that mount after the first load. */
export function getCachedRuntimeConfig(): RuntimeConfig | null {
  return resolved;
}
