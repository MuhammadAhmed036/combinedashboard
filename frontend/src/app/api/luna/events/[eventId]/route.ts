import { NextRequest, NextResponse } from 'next/server';
import { fetchLunaEventById } from '@/lib/server/lunaService';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }
    const data = await fetchLunaEventById(eventId);
    if (!data) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
