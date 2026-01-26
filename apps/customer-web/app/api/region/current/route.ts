/**
 * GET /api/region/current
 * 读取 cookie current_region_id，若存在则查询 regions 表并返回 { region }，否则 { region: null }
 */

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'current_region_id';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const regionId = cookieStore.get(COOKIE_NAME)?.value ?? null;

    if (!regionId) {
      return NextResponse.json({ region: null });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('id', regionId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ region: null });
    }

    return NextResponse.json({
      region: {
        id: data.id,
        name: data.name,
        state: data.state,
        country: data.country,
        lat: data.lat,
        lng: data.lng,
        is_active: data.is_active,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
    });
  } catch (e) {
    console.error('[region/current]', e);
    return NextResponse.json({ region: null });
  }
}
