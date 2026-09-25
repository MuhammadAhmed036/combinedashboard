import { NextRequest, NextResponse } from 'next/server';
import { fetchLunaEvents } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const data = await fetchLunaEvents(searchParams);
  return NextResponse.json(data);
}
