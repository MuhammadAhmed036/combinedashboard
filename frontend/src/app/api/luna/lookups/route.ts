import { NextResponse } from 'next/server';
import { fetchLunaLookups } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

/** Display names for LUNA cards (handlers, match label -> list, lists, streams). Names and ids only. */
export async function GET() {
  const data = await fetchLunaLookups();
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
