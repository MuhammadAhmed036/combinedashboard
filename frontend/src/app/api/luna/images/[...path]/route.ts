import { NextRequest, NextResponse } from 'next/server';
import { getLunaConfig, getLunaHeaders } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

function fetchImage(subpath: string) {
  const { host, apiPort } = getLunaConfig();
  return fetch(`http://${host}:${apiPort}/6/images/${subpath}`, {
    method: 'GET',
    headers: getLunaHeaders(),
    cache: 'force-cache',
  });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string | string[] }> | { path: string | string[] } }
) {
  try {
    const params = await context.params;
    const path = params.path;
    const subpath = Array.isArray(path) ? path.join('/') : path;
    const upstream = await fetchImage(subpath);

    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const cacheControl = upstream.headers.get('cache-control') || 'public, max-age=86400';

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
