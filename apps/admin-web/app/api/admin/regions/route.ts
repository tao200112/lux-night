/**
 * GET /api/admin/regions
 * 返回所有 is_active 的 regions，用于活动创建/编辑中的 Region 下拉
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
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

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('regions')
      .select('id, name, state, country')
      .eq('is_active', true)
      .order('name');

    if (error) {
      return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: e?.message } }, { status: 500 });
  }
}
