import { NextResponse } from 'next/server';
import { fetchLunaLists } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetchLunaLists();
  return NextResponse.json(data);
}
