import { toWsBaseUrl } from "@/lib/wsBaseUrl";

export const DEFAULT_POLL_INTERVAL_MS = 5000;

export interface RuntimeConfig {
  apiBase: string | null;
  wsBase: string | null;
  pollIntervalMs: number;
  /** Base URL of the standalone person-count WebSocket service (Media Wall live occupancy). */
  personCountWsBase: string | null;
  /** Port of the person-count WebSocket, used with the page host when personCountWsBase is empty. */
  personCountWsPort: number | null;
  /** Base URL of the standalone Luna events WebSocket service. */
  lunaWsUrl: string | null;
  /** Port of the standalone Luna events WebSocket service. */
  lunaWsPort: string | null;
  /** Direct URL to VisionLabs Luna LP5 Gateway */
  lunaApiUrl: string;
  lunaHost: string;
  lunaPort: string;
  lunaAccountId: string;
  lunaAuthUser: string;
  lunaAuthPass: string;
}

const FALLBACK: RuntimeConfig = {
  apiBase: null,
  wsBase: null,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  personCountWsBase: null,
  personCountWsPort: null,
  lunaWsUrl: null,
  lunaWsPort: null,
  lunaApiUrl: "",
  lunaHost: "",
  lunaPort: "",
  lunaAccountId: "",
  lunaAuthUser: "",
  lunaAuthPass: "",
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
        personCountWsPort?: unknown;
        lunaWsUrl?: unknown;
        lunaWsPort?: unknown;
        lunaApiUrl?: unknown;
        lunaHost?: unknown;
        lunaPort?: unknown;
        lunaAccountId?: unknown;
        lunaAuthUser?: unknown;
        lunaAuthPass?: unknown;
      };
      const apiBase = typeof payload.apiBase === "string" ? payload.apiBase : null;
      const pollIntervalMs =
        typeof payload.pollIntervalMs === "number" && payload.pollIntervalMs > 0
          ? payload.pollIntervalMs
          : DEFAULT_POLL_INTERVAL_MS;
      const personCountWsBase =
        typeof payload.personCountWsBase === "string" ? payload.personCountWsBase : null;
      const personCountWsPort =
        typeof payload.personCountWsPort === "number" && payload.personCountWsPort > 0
          ? payload.personCountWsPort
          : null;
      const lunaWsUrl = typeof payload.lunaWsUrl === "string" ? payload.lunaWsUrl : null;
      const lunaWsPort = typeof payload.lunaWsPort === "string" ? payload.lunaWsPort : null;
      const lunaApiUrl = typeof payload.lunaApiUrl === "string" ? payload.lunaApiUrl : "";
      const lunaHost = typeof payload.lunaHost === "string" ? payload.lunaHost : "";
      const lunaPort = typeof payload.lunaPort === "string" ? payload.lunaPort : "";
      const lunaAccountId = typeof payload.lunaAccountId === "string" ? payload.lunaAccountId : "";
      const lunaAuthUser = typeof payload.lunaAuthUser === "string" ? payload.lunaAuthUser : "";
      const lunaAuthPass = typeof payload.lunaAuthPass === "string" ? payload.lunaAuthPass : "";

      return {
        apiBase,
        wsBase: toWsBaseUrl(apiBase),
        pollIntervalMs,
        personCountWsBase,
        personCountWsPort,
        lunaWsUrl,
        lunaWsPort,
        lunaApiUrl,
        lunaHost,
        lunaPort,
        lunaAccountId,
        lunaAuthUser,
        lunaAuthPass,
      };
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
