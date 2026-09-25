import { NextRequest, NextResponse } from 'next/server';
import { fetchLunaFace } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ faceId: string }> }
) {
  const { faceId } = await params;
  const data = await fetchLunaFace(faceId);
  return NextResponse.json(data);
}
