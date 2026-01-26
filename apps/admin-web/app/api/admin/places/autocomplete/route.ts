/**
 * GET /api/admin/places/autocomplete?input=xxx&types=cities|address
 * 服务端转发 Google Places Autocomplete，admin 鉴权；不配置 key 时 503
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to enable address/city search.', code: 'CONFIG' },
        { status: 503 }
      );
    }

    const input = req.nextUrl.searchParams.get('input')?.trim();
    const typesParam = req.nextUrl.searchParams.get('types') || 'address'; // 'cities' | 'address'

    if (!input || input.length < 2) {
      return NextResponse.json({ predictions: [] }, { status: 200 });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input);
    url.searchParams.set('key', key);
    if (typesParam === 'cities') {
      url.searchParams.set('types', '(cities)');
      url.searchParams.set('components', 'country:us');
    } else {
      url.searchParams.set('types', 'establishment|geocode');
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === 'REQUEST_DENIED') {
      return NextResponse.json(
        { error: 'Places API denied. Check GOOGLE_MAPS_API_KEY and enabled APIs.', code: 'API_DENIED' },
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
    console.error('[admin/places/autocomplete]', e);
    return NextResponse.json({ error: 'Failed to fetch autocomplete' }, { status: 500 });
  }
}
