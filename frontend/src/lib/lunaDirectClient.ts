import { loadRuntimeConfig, getCachedRuntimeConfig } from './runtimeConfig';
import type { LunaEvent, LunaList, LunaHandler } from '@/components/luna/types';

const faceAvatarCache = new Map<string, string>();

/**
 * Returns direct VisionLabs LP5 API endpoint
 */
export async function getDirectLunaBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_LUNA_API_URL) {
    return process.env.NEXT_PUBLIC_LUNA_API_URL;
  }
  const config = await loadRuntimeConfig();
  if (config.lunaApiUrl) return config.lunaApiUrl;
  if (config.lunaHost && config.lunaPort) {
    return `http://${config.lunaHost}:${config.lunaPort}/api/lp5/6`;
  }
  return '';
}

/**
 * Direct VisionLabs Luna Auth Headers
 */
export async function getDirectLunaHeaders(): Promise<Record<string, string>> {
  const config = await loadRuntimeConfig();
  const user = process.env.NEXT_PUBLIC_LUNA_AUTH_USER || config.lunaAuthUser || '';
  const pass = process.env.NEXT_PUBLIC_LUNA_AUTH_PASS || config.lunaAuthPass || '';
  const accountId =
    process.env.NEXT_PUBLIC_LUNA_ACCOUNT_ID ||
    config.lunaAccountId ||
    '';

  if (!user && !pass) return {};

  const credentials =
    typeof window !== 'undefined'
      ? btoa(`${user}:${pass}`)
      : Buffer.from(`${user}:${pass}`).toString('base64');

  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
  };
  if (accountId) {
    headers['Luna-Account-Id'] = accountId;
  }
  return headers;
}

/**
 * Resolves direct image URL to VisionLabs LP5
 */
export function resolveDirectLunaImageUrl(rawUrlOrId?: string | null): string | null {
  if (!rawUrlOrId) return null;

  const config = getCachedRuntimeConfig();
  const lunaHost = process.env.NEXT_PUBLIC_LUNA_HOST || config?.lunaHost || '';
  const lunaPort = process.env.NEXT_PUBLIC_LUNA_PORT || config?.lunaPort || '';
  const directBase = lunaHost && lunaPort ? `http://${lunaHost}:${lunaPort}/api/lp5/6` : '';

  // If already an internal Next.js proxy route, return as is
  if (rawUrlOrId.startsWith('/api/luna/')) {
    return rawUrlOrId;
  }

  // Extract standard UUID
  const uuidMatch = rawUrlOrId.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i
  );

  // If it contains "images" (full frame camera origin)
  if (rawUrlOrId.includes('/images/') || rawUrlOrId.includes('images')) {
    if (uuidMatch) {
      return directBase ? `${directBase}/images/${uuidMatch[0]}` : `/api/luna/images/${uuidMatch[0]}`;
    }
  }

  // If it contains "bodies"
  if (rawUrlOrId.includes('/bodies/') || rawUrlOrId.includes('bodies')) {
    if (uuidMatch) {
      return directBase ? `${directBase}/samples/bodies/${uuidMatch[0]}` : `/api/luna/samples/${uuidMatch[0]}`;
    }
  }

  // If it contains "faces" or "samples" or is just a UUID
  if (uuidMatch) {
    return directBase ? `${directBase}/samples/faces/${uuidMatch[0]}` : `/api/luna/samples/${uuidMatch[0]}`;
  }

  // If already a full http(s) URL
  if (rawUrlOrId.startsWith('http://') || rawUrlOrId.startsWith('https://')) {
    if (directBase && lunaPort && (rawUrlOrId.includes('/api/lp5/6') || rawUrlOrId.includes('/6/'))) {
      return rawUrlOrId.replace(/:\d+\/(?:api\/lp5\/)?6\//, `:${lunaPort}/api/lp5/6/`);
    }
    return rawUrlOrId;
  }

  return rawUrlOrId;
}

/**
 * Resolves safe internal proxy URL fallback for an image / sample
 */
export function resolveLunaSampleProxyUrl(rawUrlOrId?: string | null): string | null {
  if (!rawUrlOrId) return null;
  const uuidMatch = rawUrlOrId.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i
  );
  if (!uuidMatch) return null;
  if (rawUrlOrId.includes('images')) {
    return `/api/luna/images/${uuidMatch[0]}`;
  }
  return `/api/luna/samples/${uuidMatch[0]}`;
}

const eventDetailsCache = new Map<string, LunaEvent>();

/**
 * Fetch a single event's full details (detections, sample_id, image_origin, etc.) from VisionLabs
 */
export async function directFetchLunaEvent(eventId: string): Promise<LunaEvent | null> {
  if (!eventId) return null;
  if (eventDetailsCache.has(eventId)) {
    return eventDetailsCache.get(eventId)!;
  }
  try {
    const baseUrl = await getDirectLunaBaseUrl();
    const headers = await getDirectLunaHeaders();
    let res = await fetch(`${baseUrl}/events/${eventId}`, {
      headers,
      cache: 'force-cache',
    }).catch(() => null);

    if (!res || !res.ok) {
      // Proxy fallback via Next.js internal API
      res = await fetch(`/api/luna/events/${eventId}`).catch(() => null);
    }

    if (!res || !res.ok) return null;
    const data = await res.json();
    if (data && (data.event_id || data.face_detections || data.detections)) {
      eventDetailsCache.set(eventId, data);
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[Luna Direct] Failed to fetch event details for', eventId, err);
    return null;
  }
}

/**
 * Fetch face details directly from VisionLabs with internal proxy fallback
 */
export async function directFetchLunaFace(faceId: string) {
  if (!faceId) return null;
  if (faceAvatarCache.has(faceId)) {
    return { face_id: faceId, avatar: faceAvatarCache.get(faceId) };
  }
  try {
    const baseUrl = await getDirectLunaBaseUrl();
    const headers = await getDirectLunaHeaders();
    if (baseUrl) {
      const res = await fetch(`${baseUrl}/faces/${faceId}`, {
        headers,
        cache: 'force-cache',
      }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (data?.avatar) {
          faceAvatarCache.set(faceId, data.avatar);
        }
        return data;
      }
    }
  } catch {}

  // Proxy fallback via Next.js internal API
  try {
    const res = await fetch(`/api/luna/faces/${faceId}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.avatar) {
        faceAvatarCache.set(faceId, data.avatar);
      }
      return data;
    }
  } catch {}

  return null;
}

/**
 * Fetch events directly from VisionLabs
 */
export async function directFetchLunaEvents(
  searchParams: URLSearchParams
): Promise<{ events: LunaEvent[]; total?: number }> {
  const baseUrl = await getDirectLunaBaseUrl();
  const headers = await getDirectLunaHeaders();

  const qs = searchParams.toString();
  const targetUrl = `${baseUrl}/events${qs ? `?${qs}` : ''}`;

  const res = await fetch(targetUrl, {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`VisionLabs events status ${res.status}`);
  }

  const data = await res.json();
  const events: LunaEvent[] = data.events || (Array.isArray(data) ? data : []);

  // Enrich with face avatars directly
  const faceIdsToFetch = new Set<string>();
  for (const ev of events) {
    const fId =
      ev.top_match?.face_id ||
      ev.match_result?.[0]?.candidates?.[0]?.face?.face_id ||
      (ev as any).face_id;
    if (fId && !faceAvatarCache.has(fId)) {
      faceIdsToFetch.add(fId);
    }
  }

  if (faceIdsToFetch.size > 0) {
    await Promise.allSettled(
      Array.from(faceIdsToFetch).map(async (fId) => {
        try {
          const face = await directFetchLunaFace(fId);
          if (face?.avatar) {
            faceAvatarCache.set(fId, face.avatar);
          }
        } catch {}
      })
    );
  }

  for (const ev of events) {
    const fId =
      ev.top_match?.face_id ||
      ev.match_result?.[0]?.candidates?.[0]?.face?.face_id ||
      (ev as any).face_id;
    if (fId && faceAvatarCache.has(fId)) {
      const avatar = faceAvatarCache.get(fId)!;
      if (ev.top_match) {
        (ev.top_match as any).avatar = avatar;
        if (ev.top_match.face) ev.top_match.face.avatar = avatar;
        else ev.top_match.face = { face_id: fId, avatar };
      }
      if (ev.match_result?.[0]?.candidates?.[0]?.face) {
        ev.match_result[0].candidates[0].face.avatar = avatar;
      }
      (ev as any).avatar = avatar;
    }
  }

  return { events, total: data.total || events.length };
}

export const lunaHandlerNameCache = new Map<string, string>();

export function registerLunaHandlers(handlers: LunaHandler[]) {
  if (!Array.isArray(handlers)) return;
  for (const h of handlers) {
    if (!h.handler_id) continue;
    const name = (h as any).name || h.description;
    if (name && typeof name === 'string' && name.trim()) {
      const clean = name.trim();
      lunaHandlerNameCache.set(h.handler_id, clean);
      lunaHandlerNameCache.set(h.handler_id.toLowerCase(), clean);
      lunaHandlerNameCache.set(h.handler_id.slice(0, 8), clean);
      lunaHandlerNameCache.set(h.handler_id.slice(0, 8).toLowerCase(), clean);
    }
  }
}

/**
 * Fetch a single handler's description/name on demand
 */
export async function directFetchLunaHandlerName(handlerId: string): Promise<string | null> {
  if (!handlerId) return null;
  const hLower = handlerId.toLowerCase();
  const hPrefix = handlerId.slice(0, 8).toLowerCase();
  if (lunaHandlerNameCache.has(hLower)) return lunaHandlerNameCache.get(hLower)!;
  if (lunaHandlerNameCache.has(hPrefix)) return lunaHandlerNameCache.get(hPrefix)!;

  try {
    const baseUrl = await getDirectLunaBaseUrl();
    const headers = await getDirectLunaHeaders();
    let res = await fetch(`${baseUrl}/handlers/${handlerId}`, {
      headers,
      cache: 'force-cache',
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`/api/luna/handlers/${handlerId}`).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      const name = data?.description || data?.name || null;
      if (name && typeof name === 'string' && name.trim()) {
        const clean = name.trim();
        lunaHandlerNameCache.set(handlerId, clean);
        lunaHandlerNameCache.set(hLower, clean);
        lunaHandlerNameCache.set(hPrefix, clean);
        return clean;
      }
    }
  } catch {}
  return null;
}

/**
 * Fetch handlers directly from VisionLabs
 */
export async function directFetchLunaHandlers(): Promise<LunaHandler[]> {
  const baseUrl = await getDirectLunaBaseUrl();
  const headers = await getDirectLunaHeaders();
  const res = await fetch(`${baseUrl}/handlers?page=1&page_size=100`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  const handlers: LunaHandler[] = data.handlers || (Array.isArray(data) ? data : []);
  registerLunaHandlers(handlers);
  return handlers;
}

/**
 * Fetch lists directly from VisionLabs
 */
export async function directFetchLunaLists(): Promise<LunaList[]> {
  const baseUrl = await getDirectLunaBaseUrl();
  const headers = await getDirectLunaHeaders();
  const res = await fetch(`${baseUrl}/lists?page=1&page_size=100`, {
    headers,
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.lists || (Array.isArray(data) ? data : []);
}
