/**
 * GET /api/places/autocomplete?input=xxx
 * 服务端转发 Google Places Autocomplete，避免暴露 GOOGLE_MAPS_API_KEY
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to enable address search.' },
      { status: 503 }
    );
  }

  const input = req.nextUrl.searchParams.get('input')?.trim();
  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] }, { status: 200 });
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('types', 'establishment|geocode');
    url.searchParams.set('key', key);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === 'REQUEST_DENIED') {
      console.error('[places/autocomplete]', data.error_message || data.status);
      return NextResponse.json(
        { error: 'Places API request denied. Check GOOGLE_MAPS_API_KEY and APIs enabled.' },
        { status: 502 }
      );
    }
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return NextResponse.json({ predictions: data.predictions || [] }, { status: 200 });
    }

    const predictions = (data.predictions || []).map((p: { place_id?: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string } }) => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text ?? p.description,
      secondary_text: p.structured_formatting?.secondary_text ?? '',
    }));

    return NextResponse.json({ predictions });
  } catch (e) {
    console.error('[places/autocomplete]', e);
    return NextResponse.json(
      { error: 'Failed to fetch autocomplete results' },
      { status: 500 }
    );
  }
}
