/**
 * GET /api/merchant/venues/[id] - 单条
 * 编辑 venue 仅在 admin 端操作
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveWorkspace } from '@/lib/internal/workspace';
import { requireInternalAuth } from '@/lib/internal/auth';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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
