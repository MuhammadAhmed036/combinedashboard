import { NextRequest, NextResponse } from 'next/server';
import { getLunaConfig, getLunaHeaders } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

function fetchSample(sampleId: string) {
  const { host, apiPort } = getLunaConfig();
  return fetch(`http://${host}:${apiPort}/6/samples/${sampleId}`, {
    method: 'GET',
    headers: getLunaHeaders(),
    cache: 'force-cache',
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sampleId: string }> }
) {
  try {
    const { sampleId } = await params;
    const upstream = await fetchSample(sampleId);

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
