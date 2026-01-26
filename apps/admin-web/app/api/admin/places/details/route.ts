/**
 * POST /api/admin/places/details { place_id }
 * 返回 Google Places Details 解析后的结构化地址，admin 鉴权；不配置 key 时 503
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPlaceDetails } from '@/lib/places';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env.', code: 'CONFIG' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const place_id = (body.place_id || '').trim();
    if (!place_id) return NextResponse.json({ error: 'place_id is required' }, { status: 400 });

    const details = await getPlaceDetails(place_id);
    if (!details) return NextResponse.json({ error: 'Invalid place_id or Places API error' }, { status: 400 });

    return NextResponse.json(details);
  } catch (e) {
    console.error('[admin/places/details]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
