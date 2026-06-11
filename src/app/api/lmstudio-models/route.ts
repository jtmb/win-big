import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.searchParams.get('baseUrl');
  if (!baseUrl) {
    return NextResponse.json({ error: 'Missing baseUrl param' }, { status: 400 });
  }

  try {
    const url = baseUrl.replace(/\/+$/, '') + '/models';
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `LM Studio returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to reach LM Studio. Is it running?' }, { status: 502 });
  }
}
