/**
 * GET /api/regions - 列表（需登录）
 * POST /api/regions - 新增（仅 platform admin）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getPlaceDetails, slugFromName } from '@/lib/places';

function getAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const admin = getAdmin();
  if (!admin) return false;
  const { data } = await admin.from('admin_users').select('user_id').eq('user_id', userId).eq('is_active', true).maybeSingle();
  return !!data;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const { data, error } = await admin
      .from('regions')
      .select('id, name, slug, state, country, city, lat, lng, center_lat, center_lng, is_active')
      .order('name');

    if (error) {
      console.error('[regions GET]', error);
      return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 });
    }
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('[regions GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    if (!(await isPlatformAdmin(user.id))) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Only platform admin can create regions' }, { status: 403 });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to add regions with address.' },
        { status: 503 }
      );
    }

    let body: { name?: string; place_id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON body with name and place_id required' }, { status: 400 });
    }

    const name = body.name?.trim();
    const place_id = body.place_id?.trim();
    if (!name || !place_id) {
      return NextResponse.json({ error: 'name and place_id are required' }, { status: 400 });
    }

    const details = await getPlaceDetails(place_id);
    if (!details) {
      return NextResponse.json({ error: 'Invalid place_id or Places API error' }, { status: 400 });
    }

    const slug = slugFromName(name);
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const { data: existing } = await admin.from('regions').select('id').eq('slug', slug).maybeSingle();
    let finalSlug = slug;
    if (existing) {
      finalSlug = `${slug}-${Date.now().toString(36)}`;
    }

    const { data: inserted, error } = await admin
      .from('regions')
      .insert({
        name,
        slug: finalSlug,
        state: details.state || null,
        country: details.country || 'US',
        city: details.city || null,
        lat: details.lat || null,
        lng: details.lng || null,
        center_lat: details.lat || null,
        center_lng: details.lng || null,
        is_active: true,
      })
      .select('id, name, slug, state, country, city, center_lat, center_lng')
      .single();

    if (error) {
      console.error('[regions POST]', error);
      return NextResponse.json({ error: error.message || 'Failed to create region' }, { status: 500 });
    }
    return NextResponse.json({ data: inserted });
  } catch (e) {
    console.error('[regions POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
