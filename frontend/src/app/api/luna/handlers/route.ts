import { NextResponse } from 'next/server';
import { fetchLunaHandlers } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetchLunaHandlers();
  return NextResponse.json(data);
}
