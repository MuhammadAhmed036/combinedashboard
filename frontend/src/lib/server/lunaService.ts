/**
 * Luna Platform Server Service
 * ============================
 * Provides server-side authenticated proxy communication with the Luna API.
 * Connects to Luna Core at http://${LUNA_HOST}:${LUNA_API_PORT}/6/*
 */

export function getLunaConfig() {
  return {
    host: process.env.LUNA_HOST || process.env.NEXT_PUBLIC_LUNA_HOST || '',
    apiPort: process.env.LUNA_API_PORT || process.env.LUNA_CORE_PORT || '',
    gatewayPort: process.env.LUNA_GATEWAY_PORT || process.env.LUNA_WEB_PORT || process.env.NEXT_PUBLIC_LUNA_PORT || '',
    accountId: process.env.LUNA_ACCOUNT_ID || process.env.NEXT_PUBLIC_LUNA_ACCOUNT_ID || '',
    authUser: process.env.LUNA_AUTH_USER || process.env.NEXT_PUBLIC_LUNA_AUTH_USER || '',
    authPass: process.env.LUNA_AUTH_PASS || process.env.NEXT_PUBLIC_LUNA_AUTH_PASS || '',
  };
}

export function getLunaHeaders(): Record<string, string> {
  const { authUser, authPass, accountId } = getLunaConfig();
  const headers: Record<string, string> = {};
  if (authUser || authPass) {
    const credentials = Buffer.from(`${authUser}:${authPass}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }
  if (accountId) {
    headers['Luna-Account-Id'] = accountId;
  }
  return headers;
}

export function getLunaBaseUrl() {
  const { host, apiPort } = getLunaConfig();
  if (!host || !apiPort) return '';
  // Luna Core uses version path /6 (e.g. /6/events, /6/lists, /6/images)
  return `http://${host}:${apiPort}/6`;
}

export async function fetchLunaEvents(searchParams: URLSearchParams) {
  try {
    const baseUrl = getLunaBaseUrl();
    if (!baseUrl) {
      return { events: [], offline: true, error: 'Luna server host/port is not configured' };
    }
    const headers = {
      ...getLunaHeaders(),
      'Content-Type': 'application/json',
    };

    const qs = searchParams.toString();
    const targetUrl = `${baseUrl}/events${qs ? `?${qs}` : ''}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return { events: [], error: `Luna status ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    const events = result.events || (Array.isArray(result) ? result : []);

    if (Array.isArray(events) && events.length > 0) {
      const faceIdsToFetch = new Set<string>();
      for (const ev of events) {
        const faceId =
          ev.top_match?.face_id ||
          ev.top_match?.face?.face_id ||
          ev.match_result?.[0]?.candidates?.[0]?.face?.face_id ||
          ev.face_id;
        if (faceId && !faceAvatarCache.has(faceId)) {
          faceIdsToFetch.add(faceId);
        }
      }

      if (faceIdsToFetch.size > 0) {
        await Promise.allSettled(
          Array.from(faceIdsToFetch).map(async (fId) => {
            await resolveFaceAvatar(fId);
          })
        );
      }

      for (const ev of events) {
        const faceId =
          ev.top_match?.face_id ||
          ev.top_match?.face?.face_id ||
          ev.match_result?.[0]?.candidates?.[0]?.face?.face_id ||
          ev.face_id;
        if (faceId && faceAvatarCache.has(faceId)) {
          const avatar = faceAvatarCache.get(faceId);
          if (ev.top_match) {
            ev.top_match.avatar = avatar;
            if (ev.top_match.face) ev.top_match.face.avatar = avatar;
            else ev.top_match.face = { face_id: faceId, avatar };
          }
          if (ev.match_result?.[0]?.candidates?.[0]?.face) {
            ev.match_result[0].candidates[0].face.avatar = avatar;
          }
          if (!ev.avatar) {
            ev.avatar = avatar;
          }
        }
      }
    }

    return result;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Luna offline';
    return { events: [], offline: true, error: errorMsg };
  }
}

const faceAvatarCache = new Map<string, string>();

export async function resolveFaceAvatar(faceId: string): Promise<string | null> {
  if (!faceId) return null;
  if (faceAvatarCache.has(faceId)) {
    return faceAvatarCache.get(faceId) || null;
  }
  try {
    const faceData = await fetchLunaFace(faceId);
    if (faceData && faceData.avatar) {
      faceAvatarCache.set(faceId, faceData.avatar);
      return faceData.avatar;
    }
  } catch (err) {
    console.error(`Failed to resolve face avatar for ${faceId}:`, err);
  }
  return null;
}

export async function fetchLunaLists() {
  try {
    const baseUrl = getLunaBaseUrl();
    if (!baseUrl) {
      return { lists: [], offline: true, error: 'Luna server host/port is not configured' };
    }
    const targetUrl = `${baseUrl}/lists?page=1&page_size=100`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...getLunaHeaders(),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { lists: [], error: `Luna lists status ${response.status}` };
    }

    return await response.json();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Luna offline';
    return { lists: [], offline: true, error: errorMsg };
  }
}

export async function fetchLunaHandlers() {
  try {
    const baseUrl = getLunaBaseUrl();
    if (!baseUrl) {
      return { handlers: [], offline: true, error: 'Luna server host/port is not configured' };
    }
    const targetUrl = `${baseUrl}/handlers?page=1&page_size=100`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...getLunaHeaders(),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { handlers: [], error: `Luna handlers status ${response.status}` };
    }

    return await response.json();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Luna offline';
    return { handlers: [], offline: true, error: errorMsg };
  }
}

export async function fetchLunaFace(faceId: string) {
  try {
    const baseUrl = getLunaBaseUrl();
    if (!baseUrl) {
      return { offline: true, error: 'Luna server host/port is not configured' };
    }
    const targetUrl = `${baseUrl}/faces/${faceId}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...getLunaHeaders(),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return { error: `Luna face status ${response.status}` };
    }

    return await response.json();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Luna offline';
    return { offline: true, error: errorMsg };
  }
}

export async function fetchLunaMedia(pathOrId: string) {
  const { host, apiPort } = getLunaConfig();
  if (!host || !apiPort) {
    return new Response(null, { status: 503 });
  }
  let targetUrl: string;

  if (pathOrId.startsWith('http://') || pathOrId.startsWith('https://')) {
    targetUrl = pathOrId;
  } else if (pathOrId.startsWith('/')) {
    targetUrl = `http://${host}:${apiPort}${pathOrId}`;
  } else {
    // If it's a UUID, check samples first
    targetUrl = `http://${host}:${apiPort}/6/samples/${pathOrId}`;
  }

  return fetch(targetUrl, {
    method: 'GET',
    headers: getLunaHeaders(),
    cache: 'force-cache',
  });
}

export async function fetchLunaEventById(eventId: string) {
  try {
    const baseUrl = getLunaBaseUrl();
    if (!baseUrl) return null;
    const targetUrl = `${baseUrl}/events/${eventId}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        ...getLunaHeaders(),
        'Content-Type': 'application/json',
      },
      cache: 'force-cache',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (err: unknown) {
    console.error(`Failed to fetch Luna event ${eventId}:`, err);
    return null;
  }
}

// Added this explicit alias in case VSCode is caching the old module signature
export const getLunaMedia = fetchLunaMedia;


// ─── Display-name lookups for the LUNA panel cards ─────────────────────────────
// handler_id -> {description, match label -> list_id}, list_id -> name,
// stream_id -> camera name. Built here with the server's credentials; only names
// and ids leave the server (LUNA stream objects contain RTSP URLs with camera
// credentials). One cached result serves every card and browser.
export interface LunaLookupsPayload {
  handlers: Record<string, { name: string | null; labels: Record<string, string> }>;
  lists: Record<string, string>;
  streams: Record<string, string>;
  complete: boolean;
}

const LOOKUP_TTL_MS = 60_000;
const LOOKUP_RETRY_MS = 15_000;
const LOOKUP_TIMEOUT_MS = 5_000;
const LOOKUP_PAGE_SIZE = 100;
const LOOKUP_MAX_PAGES = 10;
let lookupCache: { expiresAt: number; data: LunaLookupsPayload } | null = null;
let lookupInFlight: Promise<LunaLookupsPayload> | null = null;

/** All pages of a LUNA collection (`{<key>: [...]}` or a bare array); null when unavailable. */
async function fetchLunaCollection(url: string, key: string): Promise<Record<string, unknown>[] | null> {
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= LOOKUP_MAX_PAGES; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('page', String(page));
    pageUrl.searchParams.set('page_size', String(LOOKUP_PAGE_SIZE));
    try {
      const response = await fetch(pageUrl, {
        headers: getLunaHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return page === 1 ? null : items;
      }
      const body = await response.json();
      const batch = Array.isArray(body) ? body : Array.isArray(body?.[key]) ? body[key] : [];
      items.push(...batch);
      if (batch.length < LOOKUP_PAGE_SIZE) break;
    } catch {
      return page === 1 ? null : items;
    }
  }
  return items;
}

function nameOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadLunaLookups(): Promise<LunaLookupsPayload> {
  const baseUrl = getLunaBaseUrl();
  const { host, gatewayPort } = getLunaConfig();
  // LUNA Streams is served by the LUNA gateway (same host as the panel's LUNA API URL).
  const streamsUrl = host && gatewayPort ? `http://${host}:${gatewayPort}/api/luna-streams/1/streams` : null;
  const [handlers, lists, streams] = await Promise.all([
    baseUrl ? fetchLunaCollection(`${baseUrl}/handlers`, 'handlers') : Promise.resolve(null),
    baseUrl ? fetchLunaCollection(`${baseUrl}/lists`, 'lists') : Promise.resolve(null),
    streamsUrl ? fetchLunaCollection(streamsUrl, 'streams') : Promise.resolve(null),
  ]);

  const payload: LunaLookupsPayload = {
    handlers: {},
    lists: {},
    streams: {},
    complete: handlers !== null && lists !== null && streams !== null,
  };
  for (const handler of handlers ?? []) {
    const id = nameOf(handler.handler_id);
    if (!id) continue;
    const labels: Record<string, string> = {};
    const policies = (handler.policies ?? {}) as { match_policy?: unknown };
    for (const policy of Array.isArray(policies.match_policy) ? policies.match_policy : []) {
      const label = nameOf(policy?.label);
      const listId = nameOf(policy?.candidates?.list_id);
      if (label && listId) labels[label] = listId;
    }
    payload.handlers[id] = { name: nameOf(handler.description), labels };
  }
  for (const list of lists ?? []) {
    const id = nameOf(list.list_id);
    const name = nameOf(list.user_data);
    if (id && name) payload.lists[id] = name;
  }
  for (const stream of streams ?? []) {
    const id = nameOf(stream.stream_id);
    const name = nameOf(stream.name);
    if (id && name) payload.streams[id] = name;
  }
  return payload;
}

export async function fetchLunaLookups(): Promise<LunaLookupsPayload> {
  if (lookupCache && lookupCache.expiresAt > Date.now()) return lookupCache.data;
  if (lookupInFlight) return lookupInFlight;
  lookupInFlight = loadLunaLookups()
    .then((data) => {
      lookupCache = { data, expiresAt: Date.now() + (data.complete ? LOOKUP_TTL_MS : LOOKUP_RETRY_MS) };
      return data;
    })
    .finally(() => {
      lookupInFlight = null;
    });
  return lookupInFlight;
}
