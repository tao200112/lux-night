/**
 * GET /api/merchant/venues/[id] - 单条
 * PUT /api/merchant/venues/[id] - 更新；允许 name、address_line2（手填）、place_id（重新解析覆盖结构化地址）
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const ws = await getActiveWorkspace();
    if (!ws) return NextResponse.json({ error: 'NO_WORKSPACE' }, { status: 403 });

    const { id } = await params;
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const { data, error } = await admin
      .from('venues')
      .select('id, name, region_id, address, formatted_address, address_line1, address_line2, city, state, postal_code, country, lat, lng, place_id, is_active')
      .eq('id', id)
      .eq('merchant_id', ws.merchantId)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e: unknown) {
    if ((e as Error)?.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    console.error('[merchant/venues GET id]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireInternalAuth();
    const ws = await getActiveWorkspace();
    if (!ws) return NextResponse.json({ error: 'NO_WORKSPACE' }, { status: 403 });

    const { id } = await params;
    let body: { name?: string; address_line2?: string; place_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const update: Record<string, unknown> = {};

    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.address_line2 !== undefined) update.address_line2 = body.address_line2 === '' ? null : String(body.address_line2);

    if (body.place_id?.trim()) {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return NextResponse.json(
          { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to update venue address from place.' },
          { status: 503 }
        );
      }
      const details = await getPlaceDetails(body.place_id.trim());
      if (details) {
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
      return NextResponse.json({ error: 'No allowed fields to update (name, address_line2, place_id)' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('venues')
      .update(update)
      .eq('id', id)
      .eq('merchant_id', ws.merchantId)
      .select('id, name, region_id, formatted_address, address_line2, city, state, place_id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This address (place_id) is already used by another venue.', code: 'PLACE_ID_DUPLICATE' }, { status: 400 });
      }
      console.error('[merchant/venues PUT]', error);
      return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e: unknown) {
    if ((e as Error)?.message === 'UNAUTHENTICATED') return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    console.error('[merchant/venues PUT]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
