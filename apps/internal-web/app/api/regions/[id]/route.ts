/**
 * GET /api/regions/[id] - 单条
 * PUT /api/regions/[id] - 更新（仅 platform admin），支持 place_id 重新解析或直接字段
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const { data, error } = await admin
      .from('regions')
      .select('id, name, slug, state, country, city, lat, lng, center_lat, center_lng, is_active')
      .eq('id', id)
      .single();

    if (error || !data) return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    console.error('[regions GET id]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (!(await isPlatformAdmin(user.id))) {
      return NextResponse.json({ error: 'FORBIDDEN', message: 'Only platform admin can update regions' }, { status: 403 });
    }

    let body: { name?: string; place_id?: string; city?: string; state?: string; country?: string; center_lat?: number; center_lng?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON body required' }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

    const update: Record<string, unknown> = {};

    if (body.place_id) {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return NextResponse.json(
          { error: 'GOOGLE_MAPS_API_KEY not configured. Set it in .env to update region address from place.' },
          { status: 503 }
        );
      }
      const details = await getPlaceDetails(body.place_id);
      if (details) {
        update.city = details.city || null;
        update.state = details.state || null;
        update.country = details.country || null;
        update.center_lat = details.lat || null;
        update.center_lng = details.lng || null;
        update.lat = details.lat || null;
        update.lng = details.lng || null;
      }
    } else {
      if (body.city !== undefined) update.city = body.city;
      if (body.state !== undefined) update.state = body.state;
      if (body.country !== undefined) update.country = body.country;
      if (body.center_lat !== undefined) update.center_lat = body.center_lat;
      if (body.center_lng !== undefined) update.center_lng = body.center_lng;
    }

    if (body.name?.trim()) {
      update.name = body.name.trim();
      update.slug = slugFromName(body.name.trim());
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('regions')
      .update(update)
      .eq('id', id)
      .select('id, name, slug, state, country, city, center_lat, center_lng')
      .single();

    if (error) {
      console.error('[regions PUT]', error);
      return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch (e) {
    console.error('[regions PUT]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
