/**
 * POST /api/places/details
 * Body: { place_id }
 * 返回 Google Places Details 解析后的结构化地址
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlaceDetails } from '@/lib/places';

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env.' },
      { status: 503 }
    );
  }

  let body: { place_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON body with place_id required' }, { status: 400 });
  }
  const place_id = body.place_id?.trim();
  if (!place_id) {
    return NextResponse.json({ error: 'place_id is required' }, { status: 400 });
  }

  const details = await getPlaceDetails(place_id);
  if (!details) {
    return NextResponse.json({ error: 'Invalid place_id or Places API error' }, { status: 400 });
  }
  return NextResponse.json(details);
}
