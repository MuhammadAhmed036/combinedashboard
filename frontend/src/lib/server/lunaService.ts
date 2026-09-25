/**
 * Luna Platform Server Service
 * ============================
 * Provides server-side authenticated proxy communication with the Luna API.
 * Connects to Luna Core at http://${LUNA_HOST}:${LUNA_API_PORT}/6/*
 */

export function getLunaConfig() {
  return {
    host: process.env.LUNA_HOST || '192.168.18.71',
    apiPort: process.env.LUNA_API_PORT || '5000',
    accountId: process.env.LUNA_ACCOUNT_ID || '00000000-0000-4000-b000-000000000146',
    authUser: process.env.LUNA_AUTH_USER || 'root@visionlabs.ai',
    authPass: process.env.LUNA_AUTH_PASS || 'root',
  };
}

export function getLunaHeaders() {
  const { authUser, authPass, accountId } = getLunaConfig();
  const credentials = Buffer.from(`${authUser}:${authPass}`).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Luna-Account-Id': accountId,
  };
}

export function getLunaBaseUrl() {
  const { host, apiPort } = getLunaConfig();
  // Luna Core uses version path /6 (e.g. /6/events, /6/lists, /6/images)
  return `http://${host}:${apiPort}/6`;
}

export async function fetchLunaEvents(searchParams: URLSearchParams) {
  try {
    const baseUrl = getLunaBaseUrl();
    const headers = {
      ...getLunaHeaders(),
      'Content-Type': 'application/json',
    };

    const gender = searchParams.get('gender');
    const apparentGender = searchParams.get('apparent_gender');

    // Luna API uses `apparent_gender` for body detections and `gender` for face detections.
    // If both are passed together with the same value, Luna performs an AND operation,
    // which drops all body-only events where face `gender` is null.
    // In that case, keep `apparent_gender` so body detections are matched.
    const resolvedParams = new URLSearchParams(searchParams);
    if (gender !== null && apparentGender !== null && gender === apparentGender) {
      resolvedParams.delete('gender');
    }

    // If only `gender` was provided (user selected Gender in UI), in deployments with
    // body detections, Luna returns 0 unless `apparent_gender` is queried.
    // Query with `apparent_gender` first:
    if (gender !== null && apparentGender === null) {
      const pBody = new URLSearchParams(searchParams);
      pBody.delete('gender');
      pBody.set('apparent_gender', gender);
      if (searchParams.has('age__gte') && !searchParams.has('apparent_age__gte')) {
        pBody.set('apparent_age__gte', searchParams.get('age__gte')!);
      }
      if (searchParams.has('age__lt') && !searchParams.has('apparent_age__lt')) {
        pBody.set('apparent_age__lt', searchParams.get('age__lt')!);
      }

      const bodyRes = await fetch(`${baseUrl}/events?${pBody.toString()}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (bodyRes.ok) {
        const bodyData = await bodyRes.json();
        if (bodyData.events && bodyData.events.length > 0) {
          return bodyData;
        }
      }
    }

    const qs = resolvedParams.toString();
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

    return await response.json();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Luna offline';
    return { events: [], offline: true, error: errorMsg };
  }
}

export async function fetchLunaLists() {
  try {
    const baseUrl = getLunaBaseUrl();
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

// Added this explicit alias in case VSCode is caching the old module signature
export const getLunaMedia = fetchLunaMedia;
