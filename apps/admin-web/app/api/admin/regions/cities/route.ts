/**
 * GET /api/admin/regions/cities?state=CA&country=US
 * 返回该 state+country 下 regions 表中已存在的 city 列表（方式 A，表格化选择）
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
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

    const state = req.nextUrl.searchParams.get('state')?.trim();
    const country = (req.nextUrl.searchParams.get('country')?.trim()) || 'US';

    if (!state) {
      return NextResponse.json({ success: true, data: [] });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('regions')
      .select('city')
      .eq('state', state)
      .eq('country', country)
      .not('city', 'is', null);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const cities = [...new Set((data || []).map((r: { city: string }) => r.city).filter(Boolean))].sort();
    return NextResponse.json({ success: true, data: cities });
  } catch (e: any) {
    console.error('[ADMIN REGIONS CITIES]', e);
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
  }
}
