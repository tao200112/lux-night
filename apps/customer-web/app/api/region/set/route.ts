/**
 * POST /api/region/set
 * Body: { regionId: string }
 * 校验 region 存在且 is_active，设置 cookie current_region_id，返回 { ok: true, region }
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'current_region_id';
const MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const regionId = body?.regionId ?? body?.region_id;

    if (!regionId || typeof regionId !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'regionId is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('id', regionId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: 'Region not found or inactive' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, regionId, {
      path: '/',
      maxAge: MAX_AGE,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return NextResponse.json({
      ok: true,
      region: {
        id: data.id,
        name: data.name,
        state: data.state,
        country: data.country,
        lat: data.lat,
        lng: data.lng,
        center_lat: data.center_lat ?? null,
        center_lng: data.center_lng ?? null,
        city: data.city ?? null,
        is_active: data.is_active,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
    });
  } catch (e) {
    console.error('[region/set]', e);
    return NextResponse.json(
      { ok: false, error: 'Internal error' },
      { status: 500 }
    );
  }
}
