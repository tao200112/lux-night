/**
 * GET /api/merchant/venues - 当前 merchant 的 venues 列表
 * 新增/编辑 venue 仅在 admin 端操作
 */

import { NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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
