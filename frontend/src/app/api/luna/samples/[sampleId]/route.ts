import { NextRequest, NextResponse } from 'next/server';
import { getLunaConfig, getLunaHeaders } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

async function fetchSample(sampleId: string) {
  const { host, apiPort, gatewayPort } = getLunaConfig();
  if (!host) {
    return new Response(null, { status: 503 });
  }
  const headers = getLunaHeaders();

  if (apiPort) {
    // 1. Try standard /6/samples/${sampleId}
    let res = await fetch(`http://${host}:${apiPort}/6/samples/${sampleId}`, {
      method: 'GET',
      headers,
      cache: 'force-cache',
    });
    if (res.ok) return res;

    // 2. Try /6/samples/faces/${sampleId}
    res = await fetch(`http://${host}:${apiPort}/6/samples/faces/${sampleId}`, {
      method: 'GET',
      headers,
      cache: 'force-cache',
    });
    if (res.ok) return res;

    // 3. Try /6/samples/bodies/${sampleId}
    res = await fetch(`http://${host}:${apiPort}/6/samples/bodies/${sampleId}`, {
      method: 'GET',
      headers,
      cache: 'force-cache',
    });
    if (res.ok) return res;
  }

  // 4. Try LP5 fallback if gateway port is configured
  if (gatewayPort) {
    const res = await fetch(`http://${host}:${gatewayPort}/api/lp5/6/samples/faces/${sampleId}`, {
      method: 'GET',
      headers,
      cache: 'force-cache',
    });
    return res;
  }

  return new Response(null, { status: 404 });
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
