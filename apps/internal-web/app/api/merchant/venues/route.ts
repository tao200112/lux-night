/**
 * GET /api/merchant/venues - 当前 merchant 的 venues 列表
 * POST /api/merchant/venues - 新增 venue（必须 place_id 选址）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPlaceDetails } from '@/lib/places';

function getAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    await requireInternalAuth();
    const ws = await getActiveWorkspace();
    if (!ws) {
      return NextResponse.json({ error: 'NO_WORKSPACE', message: 'No active workspace' }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const { data, error } = await admin
      .from('venues')
      .select('id, name, region_id, address, formatted_address, address_line1, address_line2, city, state, postal_code, country, lat, lng, place_id, is_active')
      .eq('merchant_id', ws.merchantId)
      .order('name');

    if (error) {
      console.error('[merchant/venues GET]', error);
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (e: unknown) {
    if ((e as Error)?.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[merchant/venues GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalAuth();
    const ws = await getActiveWorkspace();
    if (!ws) {
      return NextResponse.json({ error: 'NO_WORKSPACE', message: 'No active workspace' }, { status: 403 });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY not configured. Address search is required to add venues.' },
        { status: 503 }
      );
    }

    let body: { name?: string; region_id?: string; place_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON body with name, region_id, place_id required' }, { status: 400 });
    }

    const name = body.name?.trim();
    const region_id = body.region_id?.trim();
    const place_id = body.place_id?.trim();
    if (!name || !region_id || !place_id) {
      return NextResponse.json({ error: 'name, region_id and place_id are required. Use address search to select a place.' }, { status: 400 });
    }

    const details = await getPlaceDetails(place_id);
    if (!details) {
      return NextResponse.json({ error: 'Invalid place_id or Places API error' }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const { data: existingPlace } = await admin.from('venues').select('id').eq('place_id', place_id).maybeSingle();
    if (existingPlace) {
      return NextResponse.json({ error: 'This address is already used by another venue. Choose a different place.', code: 'PLACE_ID_DUPLICATE' }, { status: 400 });
    }

    const { data: region } = await admin.from('regions').select('id').eq('id', region_id).single();
    if (!region) {
      return NextResponse.json({ error: 'Invalid region_id' }, { status: 400 });
    }

    const { data: inserted, error } = await admin
      .from('venues')
      .insert({
        merchant_id: ws.merchantId,
        region_id,
        name,
        place_id,
        formatted_address: details.formatted_address,
        address: details.formatted_address,
        address_line1: details.address_line1 || null,
        address_line2: details.address_line2 || null,
        city: details.city || null,
        state: details.state || null,
        postal_code: details.postal_code || null,
        country: details.country || null,
        lat: details.lat || null,
        lng: details.lng || null,
        is_active: true,
      })
      .select('id, name, region_id, formatted_address, city, state, place_id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This address (place_id) is already used by another venue.', code: 'PLACE_ID_DUPLICATE' }, { status: 400 });
      }
      console.error('[merchant/venues POST]', error);
      return NextResponse.json({ error: error.message || 'Failed to create venue' }, { status: 500 });
    }
    return NextResponse.json({ data: inserted });
  } catch (e: unknown) {
    if ((e as Error)?.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }
    console.error('[merchant/venues POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
