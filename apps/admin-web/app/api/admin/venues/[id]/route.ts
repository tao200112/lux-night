/**
 * GET /api/admin/venues/[id] — 单条
 * PUT /api/admin/venues/[id] — 更新；允许 name、address_line2、place_id（重新解析地址）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlaceDetails } from '@/lib/places';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('venues')
      .select('id, name, region_id, address, formatted_address, address_line1, address_line2, city, state, postal_code, country, lat, lng, place_id, is_active')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Venue not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[ADMIN VENUES GET id]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    let body: { name?: string; address_line2?: string; place_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'JSON body required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.address_line2 !== undefined) update.address_line2 = body.address_line2 === '' ? null : String(body.address_line2);

    if (body.place_id?.trim()) {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return NextResponse.json(
          { success: false, error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to update venue address.' },
          { status: 503 }
        );
      }
      const details = await getPlaceDetails(body.place_id.trim());
      if (details) {
        const { data: other } = await admin.from('venues').select('id').eq('place_id', details.place_id).neq('id', id).maybeSingle();
        if (other) {
          return NextResponse.json(
            { success: false, error: 'This address is already used by another venue.', code: 'PLACE_ID_DUPLICATE' },
            { status: 400 }
          );
        }
        update.place_id = details.place_id;
        update.formatted_address = details.formatted_address;
        update.address = details.formatted_address;
        update.address_line1 = details.address_line1 || null;
        update.city = details.city || null;
        update.state = details.state || null;
        update.postal_code = details.postal_code || null;
        update.country = details.country || null;
        update.lat = details.lat || null;
        update.lng = details.lng || null;
        if (body.address_line2 === undefined) {
          update.address_line2 = details.address_line2 || null;
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'No allowed fields to update (name, address_line2, place_id)' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('venues')
      .update(update)
      .eq('id', id)
      .select('id, name, region_id, formatted_address, address_line2, city, state, place_id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'This address is already used by another venue.', code: 'PLACE_ID_DUPLICATE' }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error('[ADMIN VENUES PUT id]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
