/**
 * GET /api/admin/regions
 * 返回 regions 列表。?all=1 时返回全部，否则仅 is_active（用于下拉）
 * POST /api/admin/regions
 * 创建：{ country, state, city, name?, center_lat?, center_lng? }，表格化选择，不允许手打 city/state
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugFromName } from '@/lib/places';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Must be logged in' } }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Must be admin' } }, { status: 403 });
    }

    const all = req.nextUrl.searchParams.get('all') === '1';
    const admin = createAdminClient();
    let q = admin.from('regions').select('id, name, slug, city, state, country, status, is_active, center_lat, center_lng').order('name');
    if (!all) q = q.eq('is_active', true);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, code: 'UNAUTHORIZED', message: 'Must be logged in' }, { status: 401 });
    }
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      return NextResponse.json({ success: false, code: 'FORBIDDEN', message: 'Must be admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const country = (body.country || 'US').trim();
    const state = (body.state || '').trim().toUpperCase().slice(0, 2);
    const city = (body.city || '').trim();
    let name = (body.name || '').trim();
    const center_lat = typeof body.center_lat === 'number' ? body.center_lat : null;
    const center_lng = typeof body.center_lng === 'number' ? body.center_lng : null;

    if (!state || state.length !== 2) {
      return NextResponse.json({ success: false, code: 'VALIDATION_ERROR', message: 'State (2-letter) is required.' }, { status: 400 });
    }
    if (!city) {
      return NextResponse.json({ success: false, code: 'VALIDATION_ERROR', message: 'City is required. Select from dropdown or use "Select city center (Google)".' }, { status: 400 });
    }

    if (!name) name = city; // 可改为 `${city} (${state})`，这里简化为 city

    let slug = slugFromName(name);
    const admin = createAdminClient();
    const { data: ex } = await admin.from('regions').select('id').eq('slug', slug).maybeSingle();
    if (ex) slug = `${slug}-${Date.now().toString(36)}`;

    const { data: inserted, error } = await admin
      .from('regions')
      .insert({
        name,
        slug,
        country,
        state,
        city,
        center_lat: center_lat ?? undefined,
        center_lng: center_lng ?? undefined,
        lat: center_lat ?? undefined,
        lng: center_lng ?? undefined,
        is_active: true,
        status: 'Operational',
      })
      .select('id, name, slug, city, state, country, status, is_active, center_lat, center_lng')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, code: 'DUPLICATE_REGION', message: 'Region with same name/state/country or slug already exists.' }, { status: 409 });
      }
      return NextResponse.json({ success: false, code: 'CREATE_FAILED', message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: inserted });
  } catch (e: any) {
    console.error('[ADMIN REGIONS POST]', e);
    return NextResponse.json({ success: false, code: 'INTERNAL_ERROR', message: e?.message }, { status: 500 });
  }
}
