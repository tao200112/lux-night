/**
 * POST /api/places/details
 * Body: { place_id: string }
 * 调用 Google Places Details，解析 address_components + geometry，返回结构化地址
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlaceDetails } from '@/lib/places';

export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to enable address lookup.' },
      { status: 503 }
    );
  }

  let body: { place_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'place_id is required' }, { status: 400 });
  }

  const place_id = body.place_id?.trim();
  if (!place_id) {
    return NextResponse.json({ error: 'place_id is required' }, { status: 400 });
  }

  try {
    const out = await getPlaceDetails(place_id);
    if (!out) {
      return NextResponse.json({ error: 'Place not found or invalid place_id' }, { status: 404 });
    }
    return NextResponse.json(out);
  } catch (e) {
    console.error('[places/details]', e);
    return NextResponse.json(
      { error: 'Failed to fetch place details' },
      { status: 500 }
    );
  }
}
