import { loadRuntimeConfig } from './runtimeConfig';
import type { LunaEvent, LunaList, LunaHandler } from '@/components/luna/types';

const faceAvatarCache = new Map<string, string>();

/**
 * Returns direct VisionLabs LP5 API endpoint (e.g. http://192.168.18.71:8080/api/lp5/6)
 */
export async function getDirectLunaBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_LUNA_API_URL) {
    return process.env.NEXT_PUBLIC_LUNA_API_URL;
  }
  const config = await loadRuntimeConfig();
  return config.lunaApiUrl || `http://${config.lunaHost || '192.168.18.71'}:8080/api/lp5/6`;
}

/**
 * Direct VisionLabs Luna Auth Headers
 */
export async function getDirectLunaHeaders(): Promise<Record<string, string>> {
  const config = await loadRuntimeConfig();
  const user = process.env.NEXT_PUBLIC_LUNA_AUTH_USER || config.lunaAuthUser || 'root@visionlabs.ai';
  const pass = process.env.NEXT_PUBLIC_LUNA_AUTH_PASS || config.lunaAuthPass || 'root';
  const accountId =
    process.env.NEXT_PUBLIC_LUNA_ACCOUNT_ID ||
    config.lunaAccountId ||
    '00000000-0000-4000-b000-000000000146';
  const credentials =
    typeof window !== 'undefined'
      ? btoa(`${user}:${pass}`)
      : Buffer.from(`${user}:${pass}`).toString('base64');

  return {
    Authorization: `Basic ${credentials}`,
    'Luna-Account-Id': accountId,
  };
}

/**
 * Resolves direct image URL to VisionLabs LP5
 * Example: http://192.168.18.71:8080/api/lp5/6/samples/faces/6c4c9d0c-1f62-4c31-acd0-c744a46365e5
 */
export function resolveDirectLunaImageUrl(rawUrlOrId?: string | null): string | null {
  if (!rawUrlOrId) return null;

  const lunaHost = process.env.NEXT_PUBLIC_LUNA_HOST || '192.168.18.71';
  const lunaPort = process.env.NEXT_PUBLIC_LUNA_PORT || '8080';
  const directBase = `http://${lunaHost}:${lunaPort}/api/lp5/6`;

  // If already a full URL pointing to Luna LP5
  if (rawUrlOrId.includes(':8080/api/lp5/6') || rawUrlOrId.includes(':5000/6')) {
    return rawUrlOrId.replace(/:\d+\/(?:api\/lp5\/)?6\//, `:${lunaPort}/api/lp5/6/`);
  }

  // Extract standard UUID
  const uuidMatch = rawUrlOrId.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
  );
  if (uuidMatch) {
    if (rawUrlOrId.includes('images')) {
      return `${directBase}/images/${uuidMatch[0]}`;
    }
    return `${directBase}/samples/faces/${uuidMatch[0]}`;
  }

  if (rawUrlOrId.startsWith('/6/images/')) {
    return `${directBase}/images/${rawUrlOrId.replace('/6/images/', '')}`;
  }
  if (rawUrlOrId.startsWith('/6/samples/faces/')) {
    return `${directBase}/samples/faces/${rawUrlOrId.replace('/6/samples/faces/', '')}`;
  }
  if (rawUrlOrId.startsWith('/6/samples/')) {
    return `${directBase}/samples/faces/${rawUrlOrId.replace('/6/samples/', '')}`;
  }

  return rawUrlOrId;
}

/**
 * Fetch face details directly from VisionLabs
 */
export async function directFetchLunaFace(faceId: string) {
  if (!faceId) return null;
  const baseUrl = await getDirectLunaBaseUrl();
  const headers = await getDirectLunaHeaders();
  const res = await fetch(`${baseUrl}/faces/${faceId}`, {
    headers,
    cache: 'force-cache',
  });
  if (!res.ok) return null;
  return await res.json();
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
  return data.handlers || (Array.isArray(data) ? data : []);
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
